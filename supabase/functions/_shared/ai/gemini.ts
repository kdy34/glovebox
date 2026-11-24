// Gemini implementation of AiProvider (T050): generateContent with JSON mode and a
// response schema. The API key comes from the GEMINI_API_KEY function secret and is sent
// in the x-goog-api-key header, never in the URL.
import { type AiProvider, type ExtractRequest, ProviderError } from './provider.ts';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

interface GeminiResponse {
  promptFeedback?: { blockReason?: string };
  candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
}

export function createGeminiProvider(opts: { apiKey: string; model: string; fetch?: typeof fetch }): AiProvider {
  const doFetch = opts.fetch ?? fetch;
  return {
    name: 'gemini',
    model: opts.model,
    async extract(req: ExtractRequest) {
      let res: Response;
      try {
        res = await doFetch(`${BASE}/${encodeURIComponent(opts.model)}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': opts.apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: req.systemPrompt }] },
            contents: [{ role: 'user', parts: [{ inlineData: { mimeType: req.mimeType, data: base64(req.image) } }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: req.responseSchema,
              temperature: 0,
              maxOutputTokens: 8192,
            },
          }),
          signal: req.signal,
        });
      } catch (e) {
        if (req.signal.aborted || (e instanceof DOMException && (e.name === 'AbortError' || e.name === 'TimeoutError'))) {
          throw new ProviderError('timeout');
        }
        throw new ProviderError('provider_error', 'network');
      }
      if (!res.ok) {
        await res.body?.cancel();
        throw new ProviderError('provider_error', `http ${res.status}`);
      }
      const body = (await res.json().catch(() => null)) as GeminiResponse | null;
      if (!body) throw new ProviderError('provider_error', 'bad response');
      if (body.promptFeedback?.blockReason) throw new ProviderError('provider_error', 'blocked');
      const candidate = body.candidates?.[0];
      if (!candidate) throw new ProviderError('provider_error', 'no candidates');
      if (candidate.finishReason && candidate.finishReason !== 'STOP') {
        throw new ProviderError('invalid_output', `finish ${candidate.finishReason}`);
      }
      const text = (candidate.content?.parts ?? []).map((p) => p.text ?? '').join('');
      try {
        return { json: JSON.parse(text), model: opts.model };
      } catch {
        throw new ProviderError('invalid_output', 'not json');
      }
    },
  };
}
