// Garage tab (T034): vehicle cards with odometer, last service, and due chips.
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRecords, useVehicles } from '@/data/queries';
import type { VehicleRow } from '@/data/types';
import { lastServiceDate, vehicleCardText } from '@/domain/vehicleCard';
import { Button, Card, EmptyState, Text } from '@/ui/components';
import { useTheme } from '@/ui/theme';

function formatServiceDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function VehicleCard({ vehicle }: { vehicle: VehicleRow }) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const { data: records } = useRecords(vehicle.id);
  // T104: the subtitle never repeats the title.
  const { title, subtitle } = vehicleCardText(vehicle, lastServiceDate(records));
  const subtitleText =
    subtitle === null ? null
      : subtitle.kind === 'text' ? subtitle.text
        : subtitle.kind === 'lastService' ? tr('garage.lastService', { date: formatServiceDate(subtitle.date) })
          : tr('garage.noService');
  return (
    <Card
      onPress={() => router.push(`/vehicle/${vehicle.id}`)}
      accessibilityLabel={subtitleText ? `${title}, ${subtitleText}` : title}
    >
      <View style={{ gap: t.spacing.sm }}>
        <Text variant="headline">{title}</Text>
        {subtitleText ? (
          <Text variant="footnote" color="textMuted">{subtitleText}</Text>
        ) : null}
      </View>
    </Card>
  );
}

export default function Garage() {
  const { t: tr } = useTranslation();
  const t = useTheme();
  const { data: vehicles, isLoading, isError } = useVehicles();

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.md, paddingBottom: t.spacing.xxxl }}
      >
        {isLoading && (
          <View style={{ padding: t.spacing.xxxl, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={t.colors.primary} accessibilityLabel={tr('common.loading')} />
          </View>
        )}
        {isError && (
          <Text variant="callout" color="dangerText" center>{tr('common.somethingWrong')}</Text>
        )}
        {!isLoading && !isError && vehicles?.length === 0 && (
          <EmptyState
            title={tr('garage.emptyTitle')}
            body={tr('garage.emptyBody')}
            actionTitle={tr('garage.addVehicle')}
            onAction={() => router.push('/vehicle/new')}
          />
        )}
        {vehicles?.map((v) => <VehicleCard key={v.id} vehicle={v} />)}
        {vehicles && vehicles.length > 0 && (
          <Button
            title={tr('garage.addVehicle')}
            variant="ghost"
            onPress={() => router.push('/vehicle/new')}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
