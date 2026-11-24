// Insights tab — shell. Built in US4 (T070).
import { EmptyState, Screen } from '@/ui/components';

export default function Insights() {
  return (
    <Screen>
      <EmptyState title="See what your car really costs" body="Once you’ve logged a few services and expenses, your monthly costs and cost per mile show up here." />
    </Screen>
  );
}
