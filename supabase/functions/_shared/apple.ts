// Sign in with Apple token revocation (App Store guideline 5.1.1(v)), best effort.
// Supabase does not keep Apple's refresh token, so the app sends a fresh
// `apple_authorization_code` (from a re-authentication) with the delete request. The server
// exchanges it for a refresh token and revokes it. Without the code or the secrets this
// does nothing, and the user can still revoke in Settings → Apple ID → Sign in with Apple.
import type { User } from '@supabase/supabase-js';

const APPLE = 'https://appleid.apple.com/auth';

export function isAppleUser(user: User): boolean {
  return user.app_metadata?.provider === 'apple' || (user.identities ?? []).some((i) => i.provider === 'apple');
}

export async function revokeAppleToken(
  user: User,
  body: Record<string, unknown>,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  if (!isAppleUser(user)) return;
  const code = body.apple_authorization_code;
  const clientId = Deno.env.get('APPLE_CLIENT_ID');
  // A client-secret JWT signed with the Sign in with Apple key (valid ≤ 6 months).
  const clientSecret = Deno.env.get('APPLE_CLIENT_SECRET');
  if (typeof code !== 'string' || !code || !clientId || !clientSecret) return;

  const signal = AbortSignal.timeout(5000);
  const tokenRes = await fetchFn(`${APPLE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: clientId, client_secret: clientSecret }),
    signal,
  });
  if (!tokenRes.ok) throw new Error(`apple token ${tokenRes.status}`);
  const { refresh_token: refreshToken } = (await tokenRes.json()) as { refresh_token?: string };
  if (!refreshToken) throw new Error('apple token: no refresh_token');

  const revokeRes = await fetchFn(`${APPLE}/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      token: refreshToken,
      token_type_hint: 'refresh_token',
    }),
    signal,
  });
  await revokeRes.body?.cancel();
  if (!revokeRes.ok) throw new Error(`apple revoke ${revokeRes.status}`);
}
