// Server-side view of app_config (contracts/app-config.md), with safe defaults.
import type { SupabaseClient } from '@supabase/supabase-js';

export interface AiConfig {
  enabled: boolean;
  provider: 'gemini';
  model: string;
  timeoutMs: number;
  lowConfidence: number;
}

export interface ServerConfig {
  monetizationEnabled: boolean;
  freeScansPerMonth: number | null;
  proScansPerMonth: number | null;
  shareLinksFree: boolean;
  ai: AiConfig;
}

export const DEFAULTS: ServerConfig = {
  monetizationEnabled: true,
  freeScansPerMonth: 5,
  proScansPerMonth: 100,
  shareLinksFree: false,
  ai: { enabled: true, provider: 'gemini', model: 'gemini-3.6-flash', timeoutMs: 30_000, lowConfidence: 0.7 },
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const count = (v: unknown, d: number | null) => (v === null || (Number.isInteger(v) && (v as number) >= 0) ? (v as number | null) : d);

export async function loadServerConfig(admin: SupabaseClient): Promise<ServerConfig> {
  const { data } = await admin.from('app_config').select('key, value');
  const c: ServerConfig = structuredClone(DEFAULTS);
  for (const row of data ?? []) {
    const v: unknown = row.value;
    if (row.key === 'monetization_enabled' && typeof v === 'boolean') c.monetizationEnabled = v;
    if (row.key === 'limits' && isObj(v) && isObj(v.free) && isObj(v.pro)) {
      c.freeScansPerMonth = count(v.free.scans_per_month, c.freeScansPerMonth);
      c.proScansPerMonth = count(v.pro.scans_per_month, c.proScansPerMonth);
      if (typeof v.free.share_links === 'boolean') c.shareLinksFree = v.free.share_links;
    }
    if (row.key === 'ai' && isObj(v)) {
      if (typeof v.enabled === 'boolean') c.ai.enabled = v.enabled;
      if (typeof v.model === 'string' && /^[a-z0-9.\-]+$/.test(v.model)) c.ai.model = v.model;
      if (Number.isInteger(v.timeout_ms) && (v.timeout_ms as number) >= 5000 && (v.timeout_ms as number) <= 60000) c.ai.timeoutMs = v.timeout_ms as number;
      if (typeof v.low_confidence === 'number' && v.low_confidence > 0 && v.low_confidence < 1) c.ai.lowConfidence = v.low_confidence;
    }
  }
  return c;
}

/** Pro if monetization is on and the server-side entitlement is active (FR-027). */
export async function isPro(admin: SupabaseClient, userId: string, cfg: ServerConfig): Promise<boolean> {
  if (!cfg.monetizationEnabled) return false;
  const { data } = await admin.from('entitlements').select('is_pro, expires_at').eq('user_id', userId).maybeSingle();
  if (!data?.is_pro) return false;
  return !data.expires_at || new Date(data.expires_at).getTime() > Date.now();
}
