// T064 — the rules screen: generic suggestions follow the fuel type and are labelled generic;
// adding one saves a generic rule starting from the latest matching service; due status shows.
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Alert } from 'react-native';
import '@/i18n';
import RulesScreen from '../../app/vehicle/[id]/rules';
import { ThemeProvider } from '@/ui/theme';

jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), selectionAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ id: 'v1' }), router: { push: jest.fn(), back: jest.fn() }, Stack: { Screen: () => null } }));
jest.mock('@/services/analytics', () => ({ track: jest.fn() }));
const mockAsk = jest.fn(async (_pre: () => Promise<boolean>) => true);
jest.mock('@/services/notifications', () => ({ askForNotifications: (p: () => Promise<boolean>) => mockAsk(p) }));
const mockSaveRule = jest.fn(async (_a: unknown) => 'r-new');
let mockVehicle: Record<string, unknown> = { id: 'v1', fuel_type: 'electric', odometer_unit: 'mi', status: 'active', nickname: null, year: 2020, make: 'Tesla', model: 'Model 3' };
let mockRules: Record<string, unknown>[] = [];
jest.mock('@/data/queries', () => ({
  useVehicle: () => ({ data: mockVehicle }),
  useRules: () => ({ data: mockRules, isLoading: false }),
  useRecords: () => ({ data: [{ kind: 'service', category: 'tire_rotation', performed_on: '2026-05-01', odometer: 20000 }] }),
  useOdometerReadings: () => ({ data: [] }),
  useSaveRule: () => ({ mutateAsync: mockSaveRule, isPending: false }),
  useSetRuleActive: () => ({ mutateAsync: jest.fn() }),
  useDeleteRule: () => ({ mutateAsync: jest.fn() }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;
beforeEach(() => { jest.clearAllMocks(); mockRules = []; });

test('an electric car is not offered an oil change, and suggestions are labelled generic', async () => {
  await render(<RulesScreen />, { wrapper });
  expect(screen.queryByText('Oil change')).toBeNull();
  expect(screen.queryByText('Engine air filter')).toBeNull();
  expect(screen.queryByText('Coolant check')).toBeNull();
  expect(screen.getByText('Battery check')).toBeTruthy();
  expect(screen.getAllByText("Generic — check your owner's manual").length).toBeGreaterThan(0);
});

test('adding a suggestion saves a generic rule from the latest matching service, after the pre-prompt', async () => {
  await render(<RulesScreen />, { wrapper });
  await fireEvent.press(screen.getByRole('button', { name: 'Add Tire rotation' }));
  expect(mockSaveRule).toHaveBeenCalledWith({
    vehicleId: 'v1',
    fields: { name: 'Tire rotation', service_category: 'tire_rotation', interval_miles: 6000, interval_months: null, lead_days: 14, lead_miles: 500 },
    source: 'generic',
    baseline: { last_done_on: '2026-05-01', last_done_odometer: 20000 },
  });
  expect(mockAsk).toHaveBeenCalledTimes(1);
});

test('a saved rule shows its due status and its generic label', async () => {
  mockRules = [{
    id: 'r1', vehicle_id: 'v1', name: 'Battery check', service_category: 'battery', interval_miles: null, interval_months: 12,
    lead_days: 14, lead_miles: 500, source: 'generic', last_done_on: '2020-01-01', last_done_odometer: null, is_active: true, created_at: '2020-01-01T00:00:00Z',
  }];
  await render(<RulesScreen />, { wrapper });
  expect(screen.getByText('Overdue')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Add Battery check' })).toBeNull(); // already added
});

test('the custom-rule form explains a missing interval', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  await render(<RulesScreen />, { wrapper });
  await fireEvent.press(screen.getByRole('button', { name: 'Add a custom reminder' }));
  await fireEvent.changeText(screen.getByLabelText('Name'), 'Transmission fluid');
  await fireEvent.press(screen.getByRole('button', { name: 'Save reminder' }));
  expect(mockSaveRule).not.toHaveBeenCalled();
  expect(screen.getByText('Enter a distance, a number of months, or both.')).toBeTruthy();
  alert.mockRestore();
});
