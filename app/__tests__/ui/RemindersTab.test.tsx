// T065 — the Reminders tab: due items across all cars in urgency order, "Log it" opens the
// record form for that car and service, "Update odometer" when there's no projection, and
// Due soon / Overdue show regardless of notification permission (US3 AS5).
import { render, screen, fireEvent, within } from '@testing-library/react-native';
import '@/i18n';
import Reminders from '../../app/(tabs)/reminders';
import { ThemeProvider } from '@/ui/theme';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (u: string) => mockPush(u) } }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), selectionAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));
const vehicle = { id: 'v1', nickname: null, year: 2009, make: 'Toyota', model: 'Prius', odometer_unit: 'mi', status: 'active' };
const due = (over: Record<string, unknown>) => ({ status: 'ok', dueOn: '2026-12-01', dueOdometer: null, decidedBy: 'time', timeDueOn: '2026-12-01', mileageDueOn: null, daysLeft: 100, distanceLeft: null, needsOdometer: false, ...over });
let mockItems: unknown[] = [];
jest.mock('@/features/reminders/useDueItems', () => ({ useDueItems: () => ({ items: mockItems, isLoading: false }) }));

const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;
beforeEach(() => { mockPush.mockClear(); });

test('lists due items in the given (urgency) order with status, car and due text', async () => {
  mockItems = [
    { vehicle, rule: { id: 'r1', name: 'Oil change', service_category: 'oil_change' }, due: due({ status: 'overdue', dueOn: '2026-05-01', dueOdometer: 155000, decidedBy: 'mileage' }) },
    { vehicle, rule: { id: 'r2', name: 'Wiper blades', service_category: 'other_maintenance' }, due: due({ status: 'due_soon' }) },
  ];
  await render(<Reminders />, { wrapper });
  const rows = screen.getAllByTestId('reminder-row');
  expect(within(rows[0]!).getByText('Oil change')).toBeTruthy();
  expect(within(rows[0]!).getByText('Overdue')).toBeTruthy();
  expect(within(rows[0]!).getByText('2009 Toyota Prius')).toBeTruthy();
  expect(within(rows[0]!).getByText('Due May 1, 2026 or at 155,000 mi, whichever comes first')).toBeTruthy();
  expect(within(rows[1]!).getByText('Due soon')).toBeTruthy();
});

test('"Log it" opens the record form for that car and service', async () => {
  mockItems = [{ vehicle, rule: { id: 'r1', name: 'Oil change', service_category: 'oil_change' }, due: due({ status: 'overdue' }) }];
  await render(<Reminders />, { wrapper });
  await fireEvent.press(screen.getByRole('button', { name: 'Log Oil change' }));
  expect(mockPush).toHaveBeenCalledWith('/record/new?vehicleId=v1&category=oil_change');
});

test('"Update odometer" when the mileage can\'t be projected', async () => {
  mockItems = [{ vehicle, rule: { id: 'r1', name: 'Tire rotation', service_category: 'tire_rotation' }, due: due({ needsOdometer: true }) }];
  await render(<Reminders />, { wrapper });
  await fireEvent.press(screen.getByRole('button', { name: 'Update odometer' }));
  expect(mockPush).toHaveBeenCalledWith('/odometer/new?vehicleId=v1');
});

test('empty state', async () => {
  mockItems = [];
  await render(<Reminders />, { wrapper });
  expect(screen.getByText('No reminders yet')).toBeTruthy();
});
