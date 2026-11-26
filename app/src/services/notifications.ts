// Local reminder notifications (T063, FR-021, research R6). The plan comes from
// domain/dueItems.planNotifications; this module only reconciles it with what iOS has
// scheduled. Reminders own identifiers starting with "glovebox-rule:"; others are left alone.
// The in-app Due soon / Overdue states don't depend on any of this (US3 AS5).
import * as Notifications from 'expo-notifications';

const PREFIX = 'glovebox-rule:';

export interface ReminderNotification {
  identifier: string;
  ruleId: string;
  vehicleId: string;
  fireAt: Date;
  title: string;
  body: string;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export async function syncReminderNotifications(plan: readonly ReminderNotification[]) {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return { scheduled: 0, cancelled: 0, permitted: false };
  const existing = new Set((await Notifications.getAllScheduledNotificationsAsync()).map((n) => n.identifier).filter((id) => id.startsWith(PREFIX)));
  const wanted = new Set(plan.map((p) => p.identifier));
  let cancelled = 0;
  for (const id of existing) {
    if (!wanted.has(id)) { await Notifications.cancelScheduledNotificationAsync(id); cancelled++; }
  }
  let scheduled = 0;
  for (const p of plan) {
    if (existing.has(p.identifier)) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: p.identifier,
      content: { title: p.title, body: p.body, data: { ruleId: p.ruleId, vehicleId: p.vehicleId, url: `/vehicle/${p.vehicleId}/rules` } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.fireAt },
    });
    scheduled++;
  }
  return { scheduled, cancelled, permitted: true };
}

/**
 * Asks for permission with an in-app explanation first (`prePrompt` resolves true if the user
 * wants reminders). The OS prompt only appears after a yes, and never when already decided.
 */
export async function askForNotifications(prePrompt: () => Promise<boolean>): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return true;
  if (current.status === 'denied' && !current.canAskAgain) return false;
  if (!(await prePrompt())) return false;
  const res = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
  return res.status === 'granted';
}

/** Calls `open(url)` when the user taps a reminder notification. Returns an unsubscribe. */
export function onReminderTapped(open: (url: string) => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((res) => {
    const url = (res.notification.request.content.data as { url?: unknown } | undefined)?.url;
    if (typeof url === 'string' && url.startsWith('/vehicle/')) open(url);
  });
  return () => sub.remove();
}
