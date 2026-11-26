// New record form (T037). Shared logic with [id].tsx.
import { router, useLocalSearchParams } from 'expo-router';
import RecordForm from './_form';

export default function NewRecord() {
  const { vehicleId, category } = useLocalSearchParams<{ vehicleId: string; category?: string }>();
  return (
    <RecordForm
      vehicleId={vehicleId ?? ''}
      initialCategory={category}
      onSaved={(id) => { router.back(); }}
      onCancel={() => router.back()}
    />
  );
}
