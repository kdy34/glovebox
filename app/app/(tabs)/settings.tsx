// Settings (T044): profile and units, reminder lead time, export my data, delete account
// (subscription guidance + double confirm), support, legal links, app version.
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/data/auth';
import { useHasSubscription, useProfile, useUpdateProfile } from '@/data/queries';
import { deleteMyAccount, exportMyData } from '@/services/account';
import { useAppConfig } from '@/services/config';
import { Button, Card, Chip, Divider, ListRow, Screen, Text } from '@/ui/components';
import { useTheme } from '@/ui/theme';

const LEAD_DAYS = [7, 14, 30] as const;
const SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';

export default function Settings() {
  const { t: tr } = useTranslation();
  const t = useTheme();
  const { session, signOut } = useAuth();
  const cfg = useAppConfig();
  const userId = session?.user.id;
  const isApple = session?.user.app_metadata?.provider === 'apple';
  const { data: profile } = useProfile(userId);
  const { mutate: update } = useUpdateProfile(userId);
  const { data: hasSubscription } = useHasSubscription(userId, cfg.monetizationEnabled);
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null);

  const runExport = async (dataOnly = false) => {
    setBusy('export');
    const res = await exportMyData({ dataOnly });
    setBusy(null);
    if (res.ok) return;
    if (res.code === 'export_too_large' && res.dataOnlyAvailable) {
      Alert.alert(tr('settings.exportTooLargeTitle'), tr('settings.exportTooLargeBody'), [
        { text: tr('common.cancel'), style: 'cancel' },
        { text: tr('settings.exportDataOnly'), onPress: () => void runExport(true) },
      ]);
      return;
    }
    Alert.alert(tr('common.error'), tr('settings.exportFailed'));
  };

  const runDelete = async () => {
    if (!userId) return;
    setBusy('delete');
    const res = await deleteMyAccount(userId, isApple);
    setBusy(null);
    if (res.ok) Alert.alert(tr('settings.deletedTitle'), tr('settings.deletedBody'));
    else Alert.alert(tr('common.error'), tr('settings.deleteFailed'));
  };

  // Second confirmation: type DELETE.
  const confirmByTyping = () => {
    Alert.prompt(
      tr('settings.deleteTypeTitle'),
      tr('settings.deleteTypeBody'),
      [
        { text: tr('common.cancel'), style: 'cancel' },
        {
          text: tr('settings.deleteConfirm'),
          style: 'destructive',
          onPress: (text?: string) => {
            if (text?.trim() === 'DELETE') void runDelete();
            else Alert.alert(tr('settings.delete'), tr('settings.deleteTypeMismatch'));
          },
        },
      ],
      'plain-text',
    );
  };

  // First confirmation.
  const confirmDelete = () => {
    Alert.alert(tr('settings.deleteTitle'), tr('settings.deleteBody'), [
      { text: tr('common.cancel'), style: 'cancel' },
      { text: tr('settings.deleteConfirm'), style: 'destructive', onPress: confirmByTyping },
    ]);
  };

  // Subscription guidance comes before either confirmation (US6 scenario 2).
  const startDelete = () => {
    if (cfg.monetizationEnabled && hasSubscription) {
      Alert.alert(tr('settings.subscriptionTitle'), tr('settings.subscriptionBody'), [
        { text: tr('common.cancel'), style: 'cancel' },
        { text: tr('settings.manageSubscription'), onPress: () => void Linking.openURL(SUBSCRIPTIONS_URL) },
        { text: tr('settings.continueDelete'), style: 'destructive', onPress: confirmDelete },
      ]);
    } else {
      confirmDelete();
    }
  };

  return (
    <Screen>
      <Card>
        <ListRow title={tr('settings.signedInAs')} subtitle={session?.user.email ?? tr('settings.appleId')} />
      </Card>

      <Text variant="headline">{tr('settings.preferences')}</Text>
      <Card>
        <View style={{ gap: t.spacing.sm }}>
          <Text variant="subhead">{tr('settings.units')}</Text>
          <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
            <Chip label={tr('settings.unitMi')} selected={profile?.distance_unit === 'mi'} onPress={() => update({ distance_unit: 'mi' })} />
            <Chip label={tr('settings.unitKm')} selected={profile?.distance_unit === 'km'} onPress={() => update({ distance_unit: 'km' })} />
          </View>
        </View>
        <Divider />
        <View style={{ gap: t.spacing.sm }}>
          <Text variant="subhead">{tr('settings.leadTime')}</Text>
          <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
            {LEAD_DAYS.map((d) => (
              <Chip
                key={d}
                label={tr('settings.leadDays', { count: d })}
                selected={profile?.reminder_lead_days === d}
                onPress={() => update({ reminder_lead_days: d })}
              />
            ))}
          </View>
        </View>
        <Divider />
        <ListRow
          title={tr('settings.notifications')}
          right={
            <Switch
              value={profile?.notifications_enabled ?? true}
              onValueChange={(v) => update({ notifications_enabled: v })}
              accessibilityLabel={tr('settings.notifications')}
            />
          }
        />
      </Card>

      <Text variant="headline">{tr('settings.yourData')}</Text>
      <Card>
        <Text variant="footnote" color="textMuted">{tr('settings.exportHint')}</Text>
        <Button
          title={busy === 'export' ? tr('settings.exporting') : tr('settings.export')}
          variant="secondary"
          loading={busy === 'export'}
          disabled={busy !== null}
          onPress={() => void runExport()}
        />
        <Button
          title={busy === 'delete' ? tr('settings.deleting') : tr('settings.delete')}
          variant="destructive"
          loading={busy === 'delete'}
          disabled={busy !== null}
          onPress={startDelete}
        />
      </Card>

      <Text variant="headline">{tr('settings.support')}</Text>
      <Card>
        <ListRow title={tr('legal.privacy')} onPress={() => router.push('/legal/privacy')} />
        <Divider />
        <ListRow title={tr('legal.terms')} onPress={() => router.push('/legal/terms')} />
        <Divider />
        <ListRow title={tr('legal.aiNotice')} onPress={() => router.push('/legal/ai-notice')} />
        <Divider />
        <ListRow
          title={tr('settings.contactSupport')}
          subtitle={cfg.supportEmail}
          onPress={() => Linking.openURL(`mailto:${cfg.supportEmail}`)}
        />
      </Card>
      <Button title={tr('settings.signOut')} variant="secondary" onPress={signOut} />
      <Text variant="footnote" color="textMuted" center>
        {tr('settings.version', { version: Constants.expoConfig?.version ?? '' })}
      </Text>
    </Screen>
  );
}
