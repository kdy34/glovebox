// T108 — a record with only a total and no line items (e.g. fuel) can be saved.
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Alert } from 'react-native';
import '@/i18n';
import RecordForm from '../../app/record/_form';
import { draftToForm } from '@/domain/extraction';
import { ThemeProvider } from '@/ui/theme';

jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), selectionAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
jest.mock('@/services/analytics', () => ({ track: jest.fn() }));
jest.mock('@/services/saveError', () => ({ reportSaveError: (_: string, __: unknown, msg: string) => msg }));
jest.mock('@/data/ids', () => ({ newId: () => `id-${Math.random().toString(36).slice(2)}` }));
const mockEnqueue = jest.fn(async (_entry: unknown) => undefined);
jest.mock('@/data/sync', () => ({ enqueue: (e: unknown) => mockEnqueue(e) }));
const mockSave = jest.fn(async (_args: unknown) => undefined);
jest.mock('@/data/repositories/records', () => ({ RecordSaveError: class extends Error {} }));
jest.mock('@/data/queries', () => ({
  useSaveRecord: () => ({ mutateAsync: mockSave, isPending: false }),
  useDeleteRecord: () => ({ mutateAsync: jest.fn() }),
  useRecord: () => ({ data: undefined }),
  useLineItems: () => ({ data: [] }),
  useVehicle: () => ({ data: { odometer_unit: 'mi' } }),
  useRecords: () => ({ data: [] }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;
const f = <T,>(value: T, confidence = 0.95) => ({ value, confidence });

beforeEach(() => { mockSave.mockClear(); mockEnqueue.mockClear(); });

test('manual: no line items, total entered → saved with subtotal = total − tax and no items', async () => {
  await render(<RecordForm vehicleId="v1" onSaved={jest.fn()} onCancel={jest.fn()} />, { wrapper });
  await fireEvent.press(screen.getByRole('button', { name: 'Expense' }));
  const total = screen.getByLabelText('Total');
  await fireEvent(total, 'focus');
  await fireEvent.changeText(total, '42.10');
  await fireEvent(total, 'blur');
  const tax = screen.getByLabelText('Tax');
  await fireEvent(tax, 'focus');
  await fireEvent.changeText(tax, '2.10');
  await fireEvent(tax, 'blur');
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  const args = mockSave.mock.calls[0]![0] as { record: Record<string, unknown>; items: unknown[] };
  expect(args.items).toEqual([]);
  expect(args.record).toMatchObject({ kind: 'expense', subtotal_cents: 4000, tax_cents: 210, total_cents: 4210 });
});

test('no line items and no total: not saved, the user is told why', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  await render(<RecordForm vehicleId="v1" onSaved={jest.fn()} onCancel={jest.fn()} />, { wrapper });
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  expect(mockSave).not.toHaveBeenCalled();
  expect(alert).toHaveBeenCalledWith('No amount', 'Add line items or enter the total.');
  alert.mockRestore();
});

test('a fuel receipt with only a total is prefilled and saves', async () => {
  const draft = draftToForm({
    schema_version: 1, is_receipt: true,
    fields: {
      shop_name: f('Shell'), shop_address: f(null, 0), performed_on: f('2026-06-01'), odometer: f(null, 0),
      subtotal_cents: f(null, 0), tax_cents: f(null, 0), total_cents: f(4210), suggested_category: f('fuel' as const),
      suggested_title: f('Fuel'), is_diy_purchase: f(false),
    },
    line_items: [], warnings: [],
  }, [], { today: '2026-06-10', newId: () => 'x' });
  await render(<RecordForm vehicleId="v1" receipt={{ attachmentId: 'a', extractionId: 'e', draft }} onSaved={jest.fn()} onCancel={jest.fn()} />, { wrapper });
  expect(screen.getByDisplayValue('$42.10')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  const args = mockSave.mock.calls[0]![0] as { record: Record<string, unknown>; items: unknown[] };
  expect(args.items).toEqual([]);
  expect(args.record).toMatchObject({ kind: 'expense', category: 'fuel', subtotal_cents: 4210, tax_cents: 0, total_cents: 4210 });
});
