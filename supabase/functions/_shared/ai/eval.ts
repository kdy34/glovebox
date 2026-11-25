// Golden-set evaluation of receipt extraction (T058, SC-003; quickstart "AI quality").
//
//   GEMINI_API_KEY=… deno task eval [dir]      (default dir: ../../docs/qa/receipts)
//
// For every <name>.jpg|.jpeg|.png|.pdf with a <name>.expected.json next to it, runs the real
// provider with the production prompt and schema, validates and post-processes the output
// exactly like extract-receipt, and scores it (evalScore.ts). Prints a per-receipt table and
// the summary: field accuracy (target ≥ 85%), totals accuracy (≥ 95%), latency p50/p90.
// Exits 1 if a target is missed. Receipt images stay local (git-ignored); see the README.
import { createGeminiProvider } from './gemini.ts';
import { SYSTEM_PROMPT } from './prompt.ts';
import { ReceiptExtractionDraft, geminiResponseSchema } from './schema.ts';
import { postProcess } from './postprocess.ts';
import { scoreReceipt, summarize, type Expected, type ReceiptRun } from './evalScore.ts';

const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', pdf: 'application/pdf' };
const TIMEOUT_MS = 30_000;

async function main() {
  const dir = Deno.args[0] ?? new URL('../../../../docs/qa/receipts', import.meta.url).pathname;
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    console.error('GEMINI_API_KEY is not set.');
    Deno.exit(2);
  }
  const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.6-flash';
  const provider = createGeminiProvider({ apiKey, model });

  const runs: ReceiptRun[] = [];
  for await (const entry of Deno.readDir(dir)) {
    const m = /^(.+)\.(jpe?g|png|pdf)$/i.exec(entry.name);
    if (!entry.isFile || !m) continue;
    const name = m[1]!;
    let expected: Expected;
    try {
      expected = JSON.parse(await Deno.readTextFile(`${dir}/${name}.expected.json`));
    } catch {
      console.warn(`skip ${entry.name}: no ${name}.expected.json`);
      continue;
    }
    const image = await Deno.readFile(`${dir}/${entry.name}`);
    const started = performance.now();
    let draft = null;
    let error: string | undefined;
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
      const res = await provider.extract({
        image, mimeType: MIME[m[2]!.toLowerCase()]!, systemPrompt: SYSTEM_PROMPT, responseSchema: geminiResponseSchema(), signal: ctl.signal,
      }).finally(() => clearTimeout(timer));
      const parsed = ReceiptExtractionDraft.safeParse(res.json);
      if (parsed.success) draft = postProcess(parsed.data);
      else error = 'invalid_output';
    } catch (e) {
      error = e instanceof Error ? e.message.split(':')[0] : 'provider_error';
    }
    const latencyMs = Math.round(performance.now() - started);
    runs.push({ name, latencyMs, score: scoreReceipt(expected, draft), error });
  }

  runs.sort((a, b) => a.name.localeCompare(b.name));
  console.table(runs.map((r) => ({
    receipt: r.name, fields: `${r.score.correct}/${r.score.total}`, total: r.score.totalCorrect ? 'ok' : 'WRONG',
    ms: r.latencyMs, wrong: r.error ?? r.score.wrong.join(', '),
  })));
  const s = summarize(runs);
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  console.log(`model ${model} · ${s.receipts} receipts`);
  console.log(`field accuracy  ${pct(s.fieldAccuracy)} (target ≥ 85%) ${s.passes.fields ? '✅' : '❌'}`);
  console.log(`totals accuracy ${pct(s.totalsAccuracy)} (target ≥ 95%) ${s.passes.totals ? '✅' : '❌'}`);
  console.log(`latency p50 ${s.latencyP50Ms} ms · p90 ${s.latencyP90Ms} ms (target ≤ 15 s incl. upload)`);
  if (!s.receipts || !s.passes.fields || !s.passes.totals) Deno.exit(1);
}

if (import.meta.main) await main();
