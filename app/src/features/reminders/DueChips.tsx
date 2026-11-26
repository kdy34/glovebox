// Garage card due chips (T066).
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Health } from '@/domain/health';
import { Chip } from '@/ui/components';
import { useTheme } from '@/ui/theme';

export function DueChips({ health }: { health: Health }) {
  const { t: tr } = useTranslation();
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xs }}>
      {health.overdue ? <Chip tone="danger" label={tr('reminders.chipOverdue', { count: health.overdue })} /> : null}
      {health.dueSoon ? <Chip tone="accent" label={tr('reminders.chipDueSoon', { count: health.dueSoon })} /> : null}
      {!health.overdue && !health.dueSoon ? <Chip tone="success" label={tr('reminders.chipAllOk')} /> : null}
    </View>
  );
}
