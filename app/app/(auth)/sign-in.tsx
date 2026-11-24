// T023 — Sign in with Apple or email one-time code (FR-001).
import * as AppleAuthentication from 'expo-apple-authentication';
import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { supabase } from '@/data/supabase';
import { isAppleSignInAvailable, signInWithApple } from '@/platform/appleAuth';
import { track } from '@/services/analytics';
import { Button, Screen, Text, TextField } from '@/ui/components';
import { useTheme } from '@/ui/theme';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function SignIn() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [step, setStep] = useState<'choose' | 'email' | 'code'>('choose');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void isAppleSignInAvailable().then(setAppleAvailable);
  }, []);

  async function onApple() {
    setError(undefined);
    const r = await signInWithApple();
    if (r.ok) track('signup_completed', { method: 'apple' });
    else if (!r.cancelled) setError(tr('common.somethingWrong'));
  }

  async function sendCode() {
    if (!EMAIL_RE.test(email.trim())) return setError(tr('auth.invalidEmail'));
    setBusy(true);
    setError(undefined);
    const { error: e } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
    setBusy(false);
    if (e) return setError(tr('common.somethingWrong'));
    setStep('code');
  }

  async function verify() {
    setBusy(true);
    setError(undefined);
    const { error: e } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (e) return setError(tr('auth.invalidCode'));
    track('signup_completed', { method: 'email' });
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={{ marginTop: t.spacing.xxxl, gap: t.spacing.sm }}>
          <Text variant="largeTitle">{tr('auth.title')}</Text>
          <Text variant="body" color="textMuted">{tr('auth.subtitle')}</Text>
        </View>

        {step === 'choose' && (
          <View style={{ gap: t.spacing.md, marginTop: t.spacing.xl }}>
            {appleAvailable && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={t.dark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={t.radius.md}
                style={{ height: 50 }}
                onPress={onApple}
              />
            )}
            <Button title={tr('auth.email')} variant="secondary" onPress={() => setStep('email')} />
          </View>
        )}

        {step === 'email' && (
          <View style={{ gap: t.spacing.md, marginTop: t.spacing.xl }}>
            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder={tr('auth.emailPlaceholder')}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="send"
              onSubmitEditing={sendCode}
              error={error}
              autoFocus
            />
            <Button title={tr('auth.sendCode')} onPress={sendCode} loading={busy} />
            <Button title={tr('common.back')} variant="ghost" onPress={() => setStep('choose')} />
          </View>
        )}

        {step === 'code' && (
          <View style={{ gap: t.spacing.md, marginTop: t.spacing.xl }}>
            <Text variant="callout" color="textMuted">{tr('auth.codeSent', { email: email.trim() })}</Text>
            <TextField
              label="Code"
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
              placeholder={tr('auth.codePlaceholder')}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              error={error}
              autoFocus
            />
            <Button title={tr('auth.verify')} onPress={verify} loading={busy} disabled={code.length !== 6} />
            <Button title={tr('auth.resend')} variant="ghost" onPress={sendCode} />
          </View>
        )}

        {step === 'choose' && error ? <Text color="dangerText">{error}</Text> : null}

        <Text variant="footnote" color="textMuted" center style={{ marginTop: t.spacing.xl }}>
          {tr('auth.legal')}{' '}
          <Link href="/legal/terms" style={{ textDecorationLine: 'underline' }}>{tr('legal.terms')}</Link>
          {' · '}
          <Link href="/legal/privacy" style={{ textDecorationLine: 'underline' }}>{tr('legal.privacy')}</Link>
        </Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}
