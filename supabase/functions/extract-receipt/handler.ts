// extract-receipt (T052, contracts/edge-functions.md): turns an uploaded receipt into a
// draft record. The draft is untrusted until the user confirms it in the app.
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, requireUser } from '../_shared/auth.ts';
import { isPro, loadServerConfig, type ServerConfig } from '../_shared/config.ts';
import { handle, HttpError, json } from '../_shared/errors.ts';
import { MAX_RECEIPT_BYTES, matchesMime, RECEIPT_MIME } from '../_shared/files.ts';
import { createGeminiProvider } from '../_shared/ai/gemini.ts';
import { isUnreadable, lowConfidenceFields, postProcess } from '../_shared/ai/postprocess.ts';
import { SYSTEM_PROMPT } from '../_shared/ai/prompt.ts';
import { type AiProvider, ProviderError, type ProviderErrorKind } from '../_shared/ai/provider.ts';
import { geminiResponseSchema, ReceiptExtractionDraft } from '../_shared/ai/schema.ts';

export interface ExtractReceiptDeps {
  provider?: AiProvider;
  /** Overrides app_config.ai.timeout_ms (which is clamped to ≥ 5 s). */
  timeoutMs?: number;
  loadFile?: (admin: SupabaseClient, storagePath: string) => Promise<Uint8Array>;
  /** Overrides on top of app_config. */
  config?: Partial<{
    monetizationEnabled: boolean;
    freeScansPerMonth: number | null;
    proScansPerMonth: number | null;
    aiEnabled: boolean;
    lowConfidence: number;
  }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function downloadReceipt(admin: SupabaseClient, path: string): Promise<Uint8Array> {
  const { data, error } = await admin.storage.from('receipts').download(path);
  if (error || !data) throw new HttpError('attachment_not_found');
  return new Uint8Array(await data.arrayBuffer());
}

function defaultProvider(cfg: ServerConfig): AiProvider {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new HttpError('provider_error');
  return createGeminiProvider({ apiKey, model: cfg.ai.model });
}

function applyOverrides(cfg: ServerConfig, o: ExtractReceiptDeps['config'] = {}): ServerConfig {
  const c = structuredClone(cfg);
  if (o.monetizationEnabled !== undefined) c.monetizationEnabled = o.monetizationEnabled;
  if (o.freeScansPerMonth !== undefined) c.freeScansPerMonth = o.freeScansPerMonth;
  if (o.proScansPerMonth !== undefined) c.proScansPerMonth = o.proScansPerMonth;
  if (o.aiEnabled !== undefined) c.ai.enabled = o.aiEnabled;
  if (o.lowConfidence !== undefined) c.ai.lowConfidence = o.lowConfidence;
  return c;
}

const periodStart = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const nextPeriod = (d = new Date()) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);

/** Runs the provider with a hard timeout, even if it ignores the abort signal. */
async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_res, rej) => {
    timer = setTimeout(() => {
      controller.abort();
      rej(new ProviderError('timeout'));
    }, ms);
  });
  try {
    return await Promise.race([run(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function createHandler(deps: ExtractReceiptDeps = {}) {
  const loadFile = deps.loadFile ?? downloadReceipt;

  return handle(async (req) => {
    if (req.method !== 'POST') throw new HttpError('bad_request');
    const { user } = await requireUser(req);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const attachmentId = body?.attachment_id;
    const vehicleId = body?.vehicle_id;
    if (typeof attachmentId !== 'string' || !UUID.test(attachmentId) || typeof vehicleId !== 'string' || !UUID.test(vehicleId)) {
      throw new HttpError('bad_request');
    }
    const admin = adminClient();

    // 1. ownership
    const { data: att } = await admin
      .from('attachments')
      .select('id, user_id, vehicle_id, storage_path, mime_type, bytes')
      .eq('id', attachmentId)
      .maybeSingle();
    if (!att || att.user_id !== user.id || att.vehicle_id !== vehicleId) throw new HttpError('attachment_not_found');

    // 2. file: declared type allowed, real size under 10 MB, bytes match the type
    if (!(RECEIPT_MIME as readonly string[]).includes(att.mime_type)) throw new HttpError('unsupported_type');
    if (Number(att.bytes) >= MAX_RECEIPT_BYTES) throw new HttpError('file_too_large');
    const image = await loadFile(admin, att.storage_path);
    if (image.byteLength >= MAX_RECEIPT_BYTES) throw new HttpError('file_too_large');
    if (!matchesMime(image, att.mime_type)) throw new HttpError('unsupported_type');

    // 3. config
    const cfg = applyOverrides(await loadServerConfig(admin), deps.config);
    if (!cfg.ai.enabled) throw new HttpError('ai_disabled');

    // 4–5. quota. With monetization off everyone gets the free limit (app-config.md).
    const pro = await isPro(admin, user.id, cfg);
    const limit = pro ? cfg.proScansPerMonth : cfg.freeScansPerMonth;
    const { data: allowed, error: quotaErr } = await admin.rpc('consume_scan', { p_user_id: user.id, p_limit: limit });
    if (quotaErr) throw new HttpError('internal');
    if (!allowed) throw new HttpError('quota_exceeded', { limit, resets_on: nextPeriod() });

    // 6. extraction row
    const provider = deps.provider ?? defaultProvider(cfg);
    const { data: row, error: rowErr } = await admin
      .from('receipt_extractions')
      .insert({ user_id: user.id, attachment_id: att.id, status: 'pending', provider: provider.name, model: provider.model })
      .select('id')
      .single();
    if (rowErr || !row) {
      await admin.rpc('refund_scan', { p_user_id: user.id });
      throw new HttpError('internal');
    }

    const started = Date.now();
    const fail = async (code: 'not_a_receipt' | 'unreadable' | ProviderErrorKind, refund: boolean): Promise<never> => {
      await admin
        .from('receipt_extractions')
        .update({ status: 'failed', error_code: code, latency_ms: Date.now() - started })
        .eq('id', row.id);
      if (refund) await admin.rpc('refund_scan', { p_user_id: user.id });
      throw new HttpError(code);
    };

    // 7. provider call (30 s by default)
    let output: unknown;
    try {
      const result = await withTimeout(deps.timeoutMs ?? cfg.ai.timeoutMs, (signal) =>
        provider.extract({
          image,
          mimeType: att.mime_type,
          systemPrompt: SYSTEM_PROMPT,
          responseSchema: geminiResponseSchema(),
          signal,
        }));
      output = result.json;
    } catch (e) {
      return await fail(e instanceof ProviderError ? e.kind : 'provider_error', true);
    }

    // 8. validate (untrusted), then post-process
    const parsed = ReceiptExtractionDraft.safeParse(output);
    if (!parsed.success) return await fail('invalid_output', true);
    if (!parsed.data.is_receipt) return await fail('not_a_receipt', false);
    if (isUnreadable(parsed.data)) return await fail('unreadable', false);
    const draft = postProcess(parsed.data);

    // 9. store the draft
    await admin
      .from('receipt_extractions')
      .update({ status: 'succeeded', draft, latency_ms: Date.now() - started })
      .eq('id', row.id);

    let scansRemaining: number | null = null;
    if (limit !== null) {
      const { data: usage } = await admin
        .from('usage_counters')
        .select('scans')
        .eq('user_id', user.id)
        .eq('period', periodStart().toISOString().slice(0, 10))
        .maybeSingle();
      scansRemaining = Math.max(0, limit - Number(usage?.scans ?? 0));
    }

    return json({
      extraction_id: row.id,
      draft,
      low_confidence_fields: lowConfidenceFields(draft, cfg.ai.lowConfidence),
      scans_remaining: scansRemaining,
    });
  });
}
