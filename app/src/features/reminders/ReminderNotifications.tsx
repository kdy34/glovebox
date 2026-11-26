// Keeps local reminder notifications in step with the data (T063): at launch and whenever
// rules, records or odometer readings change. Renders nothing.
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { router, type Href } from 'expo-router';
import { planNotifications } from '@/domain/dueItems';
import { onReminderTapped, syncReminderNotifications } from '@/services/notifications';
import { formatDueDate, vehicleLabel } from './format';
import { useDueItems } from './useDueItems';

export function ReminderNotifications() {
  const { t: tr } = useTranslation();
  const { items, isLoading } = useDueItems();
  const plan = useMemo(() => {
    const byRule = new Map(items.map((i) => [i.rule.id, i]));
    return planNotifications(items, new Date()).map((p) => {
      const item = byRule.get(p.ruleId)!;
      return {
        ...p,
        title: tr('reminders.notifyTitle', { rule: item.rule.name }),
        body: tr('reminders.notifyBody', { vehicle: vehicleLabel(item.vehicle), date: formatDueDate(item.due.dueOn!) }),
      };
    });
  }, [items, tr]);
  useEffect(() => onReminderTapped((url) => router.push(url as Href)), []);
  const key = plan.map((p) => p.identifier).join('|');
  useEffect(() => {
    if (isLoading) return;
    void syncReminderNotifications(plan).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key is the plan's identity
  }, [key, isLoading]);
  return null;
}
