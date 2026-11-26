// T063 — local reminder notifications: reschedule to match the plan (cancel stale, add missing,
// keep unchanged ones), only with permission, never touching other notifications; the
// permission pre-prompt runs before the OS prompt and only once.
const mockScheduled: { identifier: string }[] = [];
const mockPermission = { status: 'granted', canAskAgain: true };
jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { DATE: 'date' },
  getPermissionsAsync: jest.fn(async () => mockPermission),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getAllScheduledNotificationsAsync: jest.fn(async () => mockScheduled),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  setNotificationHandler: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));

import * as N from 'expo-notifications';
import { askForNotifications, syncReminderNotifications } from '@/services/notifications';

const plan = [
  { identifier: 'glovebox-rule:r1:2026-12-01', ruleId: 'r1', vehicleId: 'v1', fireAt: new Date(2026, 10, 17, 9), title: 'Oil change due soon', body: 'Prius · due Dec 1' },
  { identifier: 'glovebox-rule:r2:2026-08-01', ruleId: 'r2', vehicleId: 'v1', fireAt: new Date(2026, 6, 18, 9), title: 'Tire rotation due soon', body: 'Prius' },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockScheduled.length = 0;
  mockPermission.status = 'granted';
  mockPermission.canAskAgain = true;
});

test('schedules missing, cancels stale reminders, keeps unchanged ones and other notifications', async () => {
  mockScheduled.push({ identifier: 'glovebox-rule:r1:2026-12-01' }, { identifier: 'glovebox-rule:r1:2026-11-01' }, { identifier: 'something-else' });
  const r = await syncReminderNotifications(plan);
  expect(r).toEqual({ scheduled: 1, cancelled: 1, permitted: true });
  expect(N.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
  expect(N.cancelScheduledNotificationAsync).toHaveBeenCalledWith('glovebox-rule:r1:2026-11-01');
  expect(N.scheduleNotificationAsync).toHaveBeenCalledWith({
    identifier: 'glovebox-rule:r2:2026-08-01',
    content: { title: 'Tire rotation due soon', body: 'Prius', data: { ruleId: 'r2', vehicleId: 'v1', url: '/vehicle/v1/rules' } },
    trigger: { type: 'date', date: plan[1]!.fireAt },
  });
});

test('without permission nothing is scheduled (the in-app status still shows, AS5)', async () => {
  mockPermission.status = 'denied';
  expect(await syncReminderNotifications(plan)).toEqual({ scheduled: 0, cancelled: 0, permitted: false });
  expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
});

test('the pre-prompt runs before the OS prompt; declining it never shows the OS prompt', async () => {
  mockPermission.status = 'undetermined';
  const declined = jest.fn(async () => false);
  expect(await askForNotifications(declined)).toBe(false);
  expect(N.requestPermissionsAsync).not.toHaveBeenCalled();
  const accepted = jest.fn(async () => true);
  expect(await askForNotifications(accepted)).toBe(true);
  expect(N.requestPermissionsAsync).toHaveBeenCalledTimes(1);
});

test('no prompts when already decided', async () => {
  const pre = jest.fn(async () => true);
  expect(await askForNotifications(pre)).toBe(true); // granted
  mockPermission.status = 'denied';
  mockPermission.canAskAgain = false;
  expect(await askForNotifications(pre)).toBe(false);
  expect(pre).not.toHaveBeenCalled();
  expect(N.requestPermissionsAsync).not.toHaveBeenCalled();
});
