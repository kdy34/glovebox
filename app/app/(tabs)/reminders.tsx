// Reminders tab (T065, US3): what's due across all cars, most urgent first. Due soon / Overdue
// come from the on-device engine, so they show whatever the notification permission (AS5).
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useDueItems } from '@/features/reminders/useDueItems';
import { STATUS_TONE, dueText, vehicleLabel } from '@/features/reminders/format';
import { Button, Card, Chip, EmptyState, Screen, Text } from '@/ui/components';
import { useTheme } from '@/ui/theme';

export default function Reminders() {
  const { t: tr } = useTranslation();
  const t = useTheme();
  const { items, isLoading } = useDueItems();

  if (isLoading && items.length === 0) {
    return <Screen><ActivityIndicator accessibilityLabel={tr('common.loading')} color={t.colors.primary} /></Screen>;
  }
  if (items.length === 0) {
    return (
      <Screen>
        <EmptyState title={tr('reminders.emptyTitle')} body={tr('reminders.emptyBody')} actionTitle={tr('reminders.emptyAction')} onAction={() => router.push('/')} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      {items.map(({ vehicle, rule, due }) => {
        const line = dueText(tr, due, vehicle.odometer_unit);
        return (
          <Card key={rule.id} testID="reminder-row">
            <View style={{ gap: t.spacing.xs }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: t.spacing.sm }}>
                <Text variant="headline" style={{ flex: 1 }}>{rule.name}</Text>
                <Chip label={tr(`reminders.status.${due.status}`)} tone={STATUS_TONE[due.status]} />
              </View>
              <Text variant="footnote" color="textMuted">{vehicleLabel(vehicle)}</Text>
              {line ? <Text variant="callout">{line}</Text> : null}
              {due.decidedBy === 'mileage' ? <Text variant="footnote" color="textMuted">{tr('reminders.decidedByMileage')}</Text> : null}
              <View style={{ flexDirection: 'row', gap: t.spacing.sm, flexWrap: 'wrap' }}>
                <Button
                  title={tr('reminders.logIt')}
                  variant="secondary"
                  accessibilityLabel={tr('reminders.logItA11y', { name: rule.name })}
                  onPress={() => router.push(`/record/new?vehicleId=${vehicle.id}&category=${rule.service_category}`)}
                />
                {due.needsOdometer ? (
                  <Button title={tr('reminders.updateOdometer')} variant="ghost" onPress={() => router.push(`/odometer/new?vehicleId=${vehicle.id}`)} />
                ) : null}
              </View>
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}
