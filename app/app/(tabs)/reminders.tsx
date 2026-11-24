// Reminders tab — shell. Built in US3 (T065).
import { EmptyState, Screen } from '@/ui/components';

export default function Reminders() {
  return (
    <Screen>
      <EmptyState title="No reminders yet" body="Add a car and log a service — Glovebox will suggest reminders you can adjust." />
    </Screen>
  );
}
