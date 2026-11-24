// Edit record screen (T037). Pre-fills from existing record.
import { router, useLocalSearchParams } from 'expo-router';
import RecordForm from './_form';

export default function EditRecord() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RecordForm
      recordId={id}
      onSaved={() => router.back()}
      onDeleted={() => { router.back(); router.back(); }}
      onCancel={() => router.back()}
    />
  );
}
