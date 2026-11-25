// T101 (FR-001) — sign-up and sign-in emails carry the 6-digit code, not a link.
// The app only has a code field (app/app/(auth)/sign-in.tsx), so a link-only email is a dead end.
// Runs against local Supabase + Mailpit: ./test-local.sh
import { assert, assertEquals, assertMatch, assertNotEquals, assertStringIncludes } from '@std/assert';
import { createClient } from '@supabase/supabase-js';
import { testAdmin } from './testing.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const MAILPIT_URL = Deno.env.get('MAILPIT_URL') ?? 'http://127.0.0.1:54324';
const EXPIRY_LINE = 'Enter this code in the Glovebox app. It expires in 10 minutes.';

interface Mail {
  ID: string;
  Subject: string;
  HTML: string;
  Text: string;
}

function anon() {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Waits for a message to `email` that isn't in `seen`, and returns it. */
async function nextMail(email: string, seen: Set<string>): Promise<Mail> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    assert(res.ok, `Mailpit search failed: ${res.status}`);
    const { messages } = (await res.json()) as { messages: { ID: string }[] };
    const fresh = messages.find((m) => !seen.has(m.ID));
    if (fresh) {
      seen.add(fresh.ID);
      const msg = await fetch(`${MAILPIT_URL}/api/v1/message/${fresh.ID}`);
      assert(msg.ok, `Mailpit message fetch failed: ${msg.status}`);
      return (await msg.json()) as Mail;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No new email for ${email} within 10 s`);
}

/** Asserts the email is code-only and returns the code. */
function assertCodeEmail(mail: Mail): string {
  const code = mail.Text.match(/\b(\d{6})\b/)?.[1];
  assert(code, `no 6-digit code in the text part:\n${mail.Text}`);
  assertMatch(mail.HTML, new RegExp(`>\\s*${code}\\s*<`), 'the code is its own element in the HTML part');
  assertStringIncludes(mail.HTML, 'font-size:32px', 'the code is shown in large text');
  assertStringIncludes(mail.Text, EXPIRY_LINE);
  assertStringIncludes(mail.HTML, 'Glovebox');
  assertEquals(mail.HTML.match(/<a\b/gi), null, 'no link or link button');
  assert(!/\/auth\/v1\/verify|https?:\/\//.test(mail.Text), `no URL in the text part:\n${mail.Text}`);
  return code;
}

async function requestCode(email: string) {
  const { error } = await anon().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  assertEquals(error, null, `signInWithOtp failed: ${error?.message}`);
}

async function verifyCode(email: string, token: string) {
  const { data, error } = await anon().auth.verifyOtp({ email, token, type: 'email' });
  assertEquals(error, null, `verifyOtp failed: ${error?.message}`);
  assert(data.session?.access_token, 'verifying the code signs the user in');
  assertEquals(data.user?.email, email);
  return data.user!.id;
}

Deno.test('sign-up and sign-in emails show the 6-digit code and no link', async () => {
  const email = `t101-${crypto.randomUUID()}@test.glovebox.dev`;
  const seen = new Set<string>();
  let userId: string | undefined;
  try {
    // New user: GoTrue sends the confirmation (sign-up) template.
    await requestCode(email);
    const signUp = await nextMail(email, seen);
    userId = await verifyCode(email, assertCodeEmail(signUp));

    // Returning user: GoTrue sends the magic-link (sign-in) template.
    await requestCode(email);
    const signIn = await nextMail(email, seen);
    assertNotEquals(signIn.Subject, signUp.Subject, 'sign-in uses its own template');
    assertEquals(await verifyCode(email, assertCodeEmail(signIn)), userId, 'same account signs back in');
  } finally {
    if (userId) await testAdmin().auth.admin.deleteUser(userId);
  }
});
