// Sign in with Apple → Supabase (research R12). iOS-only code lives in src/platform (constitution VII).
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { supabase } from '@/data/supabase';

export async function isAppleSignInAvailable(): Promise<boolean> {
  return Platform.OS === 'ios' && (await AppleAuthentication.isAvailableAsync());
}

export type AppleSignInResult = { ok: true } | { ok: false; cancelled: boolean; message?: string };

export async function signInWithApple(): Promise<AppleSignInResult> {
  // Replay protection: Apple gets the SHA-256 of a random nonce, Supabase verifies the raw one.
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
    if (!credential.identityToken) return { ok: false, cancelled: false, message: 'No identity token from Apple' };
    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: rawNonce,
    });
    if (error) return { ok: false, cancelled: false, message: error.message };

    // Apple only returns the name on the first sign-in; keep it as the display name.
    const name = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(' ');
    if (name) {
      const { data } = await supabase.auth.getUser();
      if (data.user) await (supabase.from('profiles') as any).update({ display_name: name.slice(0, 80) }).eq('id', data.user.id);
    }
    return { ok: true };
  } catch (e: unknown) {
    const code = (e as { code?: string }).code;
    return { ok: false, cancelled: code === 'ERR_REQUEST_CANCELED' };
  }
}
