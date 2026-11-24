// Garage tab. Phase 2 shell: empty state + add-vehicle entry point.
// The vehicle list, due chips and health rings are built in US1 (T034) and US3 (T066).
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { EmptyState, Screen } from '@/ui/components';

export default function Garage() {
  const { t: tr } = useTranslation();
  return (
    <Screen>
      <EmptyState
        title={tr('garage.emptyTitle')}
        body={tr('garage.emptyBody')}
        actionTitle={tr('garage.addVehicle')}
        onAction={() => router.push('/vehicle/new')}
      />
    </Screen>
  );
}
