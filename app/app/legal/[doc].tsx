// T025 — legal screens. Privacy Policy and Terms have one source of truth: the public
// web pages (web/privacy.html, web/terms.html), opened in an in-app browser. The AI notice is bundled.
import { Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppConfig } from '@/services/config';
import { Button, Screen, Text } from '@/ui/components';

const AI_NOTICE = [
  'When you scan a receipt, Glovebox sends the photo to Google’s Gemini AI service to read it. Google processes it only to return the result to us; we use a paid API tier whose terms do not allow using your data to train models.',
  'The AI fills in a draft — shop, date, mileage, items and costs. Nothing is saved until you review it and tap Save. Fields the AI is unsure about are highlighted so you can check them.',
  'AI can make mistakes. Please always check the date, mileage and totals before saving. Glovebox never gives mechanical advice or diagnoses; reminders come from intervals you set or from clearly labelled generic suggestions.',
  'Your receipt photos are stored privately in your account and are deleted when you delete your account.',
];

export default function LegalDoc() {
  const { doc } = useLocalSearchParams<{ doc: 'privacy' | 'terms' | 'ai-notice' }>();
  const { t: tr } = useTranslation();
  const cfg = useAppConfig();
  const url = doc === 'privacy' ? cfg.legalUrls.privacy : doc === 'terms' ? cfg.legalUrls.terms : null;

  useEffect(() => {
    if (url) void WebBrowser.openBrowserAsync(url);
  }, [url]);

  if (url) {
    return (
      <Screen>
        <Stack.Screen options={{ title: tr(doc === 'privacy' ? 'legal.privacy' : 'legal.terms') }} />
        <Button title={`Open ${tr(doc === 'privacy' ? 'legal.privacy' : 'legal.terms')}`} onPress={() => WebBrowser.openBrowserAsync(url)} />
      </Screen>
    );
  }
  return (
    <Screen>
      <Stack.Screen options={{ title: tr('legal.aiNotice') }} />
      {AI_NOTICE.map((p) => <Text key={p.slice(0, 20)} variant="body">{p}</Text>)}
    </Screen>
  );
}
