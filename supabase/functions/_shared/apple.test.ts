// Apple token revoke (best effort) with a mocked fetch.
import { assertEquals, assertRejects } from '@std/assert';
import type { User } from '@supabase/supabase-js';
import { revokeAppleToken } from './apple.ts';

const apple = { id: 'u', app_metadata: { provider: 'apple' }, identities: [] } as unknown as User;
const email = { id: 'u', app_metadata: { provider: 'email' }, identities: [] } as unknown as User;

function mockFetch(responses: Response[]) {
  const calls: { url: string; body: string }[] = [];
  const fn = ((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), body: String(init?.body ?? '') });
    return Promise.resolve(responses.shift() ?? new Response('', { status: 500 }));
  }) as typeof fetch;
  return { fn, calls };
}

function withEnv(fn: () => Promise<void>) {
  return async () => {
    Deno.env.set('APPLE_CLIENT_ID', 'app.glovebox');
    Deno.env.set('APPLE_CLIENT_SECRET', 'secret-jwt');
    try {
      await fn();
    } finally {
      Deno.env.delete('APPLE_CLIENT_ID');
      Deno.env.delete('APPLE_CLIENT_SECRET');
    }
  };
}

Deno.test('apple revoke: does nothing for a non-Apple user', withEnv(async () => {
  const m = mockFetch([]);
  await revokeAppleToken(email, { apple_authorization_code: 'c' }, m.fn);
  assertEquals(m.calls.length, 0);
}));

Deno.test('apple revoke: does nothing without an authorization code', withEnv(async () => {
  const m = mockFetch([]);
  await revokeAppleToken(apple, {}, m.fn);
  assertEquals(m.calls.length, 0);
}));

Deno.test('apple revoke: does nothing when the secrets are not configured', async () => {
  const m = mockFetch([]);
  await revokeAppleToken(apple, { apple_authorization_code: 'c' }, m.fn);
  assertEquals(m.calls.length, 0);
});

Deno.test('apple revoke: exchanges the code, then revokes the refresh token', withEnv(async () => {
  const m = mockFetch([Response.json({ refresh_token: 'rt-1' }), new Response('', { status: 200 })]);
  await revokeAppleToken(apple, { apple_authorization_code: 'code-1' }, m.fn);
  assertEquals(m.calls.map((c) => c.url), ['https://appleid.apple.com/auth/token', 'https://appleid.apple.com/auth/revoke']);
  assertEquals(new URLSearchParams(m.calls[0]!.body).get('code'), 'code-1');
  assertEquals(new URLSearchParams(m.calls[1]!.body).get('token'), 'rt-1');
}));

Deno.test('apple revoke: throws when Apple rejects (the caller treats it as best effort)', withEnv(async () => {
  const m = mockFetch([new Response('', { status: 400 })]);
  await assertRejects(() => revokeAppleToken(apple, { apple_authorization_code: 'c' }, m.fn));
}));
