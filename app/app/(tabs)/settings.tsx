// Settings tab — Phase 2 shell (sign out, legal, support). Export / delete account land in US6 (T044).
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/data/auth';
import { useAppConfig } from '@/services/config';
import { Button, Card, Divider, ListRow, Screen, Text } from '@/ui/components';

export default function Settings() {
  const { t: tr } = useTranslation();
  const { session, signOut } = useAuth();
  const cfg = useAppConfig();
  return (
    <Screen>
      <Card>
        <ListRow title="Signed in as" subtitle={session?.user.email ?? 'Apple ID'} />
      </Card>
      <Card>
        <ListRow title={tr('legal.privacy')} onPress={() => router.push('/legal/privacy')} />
        <Divider />
        <ListRow title={tr('legal.terms')} onPress={() => router.push('/legal/terms')} />
        <Divider />
        <ListRow title={tr('legal.aiNotice')} onPress={() => router.push('/legal/ai-notice')} />
        <Divider />
        <ListRow title="Contact support" subtitle={cfg.supportEmail} onPress={() => Linking.openURL(`mailto:${cfg.supportEmail}`)} />
      </Card>
      <Button title="Sign out" variant="secondary" onPress={signOut} />
      <Text variant="footnote" color="textMuted" center>Glovebox {Constants.expoConfig?.version}</Text>
    </Screen>
  );
}
