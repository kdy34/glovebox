// Garage tab (T034): vehicle cards with odometer, last service, and due chips.
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useVehicles } from '@/data/queries';
import { Button, Card, EmptyState, Text } from '@/ui/components';
import { useTheme } from '@/ui/theme';

function VehicleCard({ vehicle }: { vehicle: { id: string; nickname: string | null; year: number; make: string; model: string; status: string; odometer_unit: string } }) {
  const t = useTheme();
  const displayName = vehicle.nickname ?? `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
  return (
    <Card
      onPress={() => router.push(`/vehicle/${vehicle.id}`)}
      accessibilityLabel={displayName}
    >
      <View style={{ gap: t.spacing.sm }}>
        <Text variant="headline">{displayName}</Text>
        {!vehicle.nickname && (
          <Text variant="footnote" color="textMuted">
            {vehicle.year} {vehicle.make} {vehicle.model}
          </Text>
        )}
        {vehicle.nickname && (
          <Text variant="footnote" color="textMuted">
            {vehicle.year} {vehicle.make} {vehicle.model}
          </Text>
        )}
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
