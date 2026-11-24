// T050 — provider interface + Gemini implementation, with a mocked fetch.
import { assert, assertEquals, assertRejects } from '@std/assert';
import { createGeminiProvider } from './gemini.ts';
import { ProviderError } from './provider.ts';

const IMAGE = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

function mockFetch(handler: (url: string, init: RequestInit) => Promise<Response> | Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = ((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return Promise.resolve(handler(String(input), init ?? {}));
  }) as typeof fetch;
  return { fn, calls };
}

const ok = (text: string) =>
  Response.json({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] });

Deno.test('gemini: sends system prompt, image, JSON mode + response schema; key in a header', async () => {
  const m = mockFetch(() => ok('{"a":1}'));
  const p = createGeminiProvider({ apiKey: 'k-123', model: 'gemini-test', fetch: m.fn });
  const out = await p.extract({ image: IMAGE, mimeType: 'image/jpeg', systemPrompt: 'SYS', responseSchema: { type: 'OBJECT' }, signal: AbortSignal.timeout(1000) });
  assertEquals(out.json, { a: 1 });
  const { url, init } = m.calls[0]!;
  assertEquals(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent');
  assertEquals((init.headers as Record<string, string>)['x-goog-api-key'], 'k-123');
  assert(!url.includes('k-123'), 'key is not in the URL');
  const body = JSON.parse(String(init.body));
  assertEquals(body.systemInstruction.parts[0].text, 'SYS');
  assertEquals(body.contents[0].parts[0].inlineData, { mimeType: 'image/jpeg', data: btoa(String.fromCharCode(...IMAGE)) });
  assertEquals(body.generationConfig.responseMimeType, 'application/json');
  assertEquals(body.generationConfig.responseSchema, { type: 'OBJECT' });
  assertEquals(body.generationConfig.temperature, 0);
  assertEquals(body.tools, undefined, 'no tools or function calling');
  assert(init.signal, 'the abort signal is passed through');
});

Deno.test('gemini: an aborted request becomes a timeout error', async () => {
  const m = mockFetch((_u, init) =>
    new Promise<Response>((_res, rej) => init.signal!.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))))
  );
  const p = createGeminiProvider({ apiKey: 'k', model: 'm', fetch: m.fn });
  const err = await assertRejects(
    () => p.extract({ image: IMAGE, mimeType: 'image/jpeg', systemPrompt: 'S', responseSchema: {}, signal: AbortSignal.timeout(20) }),
    ProviderError,
  );
  assertEquals(err.kind, 'timeout');
});

Deno.test('gemini: HTTP errors, blocked prompts, truncation and non-JSON are provider errors', async () => {
  const cases: [string, () => Response, string][] = [
    ['http 500', () => new Response('boom', { status: 500 }), 'provider_error'],
    ['blocked', () => Response.json({ promptFeedback: { blockReason: 'SAFETY' } }), 'provider_error'],
    ['truncated', () => Response.json({ candidates: [{ content: { parts: [{ text: '{"a":' }] }, finishReason: 'MAX_TOKENS' }] }), 'invalid_output'],
    ['not json', () => ok('Sure! Here is the receipt:'), 'invalid_output'],
  ];
  for (const [name, res, kind] of cases) {
    const p = createGeminiProvider({ apiKey: 'k', model: 'm', fetch: mockFetch(res).fn });
    const err = await assertRejects(
      () => p.extract({ image: IMAGE, mimeType: 'image/jpeg', systemPrompt: 'S', responseSchema: {}, signal: AbortSignal.timeout(1000) }),
      ProviderError,
      undefined,
      name,
    );
    assertEquals(err.kind, kind, name);
    assert(!err.message.includes('Sure!'), 'raw model text is not carried in the error');
  }
});
