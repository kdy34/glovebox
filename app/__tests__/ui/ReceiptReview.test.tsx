// T057 — the record form started from an AI draft: flagged fields are marked, the totals
// mismatch is explained, and on save the image is linked and corrections are recorded.
import { render, screen, fireEvent } from '@testing-library/react-native';
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
const draft = draftToForm({
  schema_version: 1,
  is_receipt: true,
  fields: {
    shop_name: f("Joe's Auto"), shop_address: f(null, 0), performed_on: f('2026-06-01'), odometer: f(150123, 0.4),
    subtotal_cents: f(6495), tax_cents: f(312), total_cents: f(9999), suggested_category: f('oil_change' as const),
    suggested_title: f('Oil change'), is_diy_purchase: f(false),
  },
  line_items: [{ item_type: 'part', description: '5W-30', quantity: 5, unit_price_cents: 899, amount_cents: 4495, confidence: 0.97 },
    { item_type: 'labor', description: 'Labor', quantity: 1, unit_price_cents: 2000, amount_cents: 2000, confidence: 0.9 }],
  warnings: ['totals_mismatch', 'handwritten'],
}, ['odometer'], { today: '2026-06-10', newId: () => `d-${Math.random().toString(36).slice(2)}` });

test('a draft shows its flags, warnings and the totals mismatch', async () => {
  await render(
    <RecordForm vehicleId="v1" receipt={{ attachmentId: 'att-1', extractionId: 'ext-1', draft }} onSaved={jest.fn()} onCancel={jest.fn()} />,
    { wrapper },
  );
  expect(screen.getByText('Check 1 field the AI wasn’t sure about.')).toBeTruthy();
  expect(screen.getByText('Please check')).toBeTruthy(); // the odometer
  expect(screen.getByText('This receipt is handwritten, so some values may be off.')).toBeTruthy();
  expect(screen.getByText(/The receipt total is \$99\.99, but the items and tax add up to \$68\.07/)).toBeTruthy();
  expect(screen.getByDisplayValue("Joe's Auto")).toBeTruthy();
});

test('saving links the image, records corrections and saves as an AI record', async () => {
  const onSaved = jest.fn();
  await render(
    <RecordForm vehicleId="v1" receipt={{ attachmentId: 'att-1', extractionId: 'ext-1', draft }} onSaved={onSaved} onCancel={jest.fn()} />,
    { wrapper },
  );
  await fireEvent.changeText(screen.getByDisplayValue('150123'), '150223');
  expect(screen.queryByText('Please check')).toBeNull(); // editing clears the flag
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  const args = mockSave.mock.calls[0]![0] as { record: Record<string, unknown> };
  expect(args.record).toMatchObject({ source: 'ai', extraction_id: 'ext-1', title: 'Oil change', odometer: 150223, shop_name: "Joe's Auto" });
  expect(mockEnqueue).toHaveBeenNthCalledWith(1, { id: 'att-1', table: 'attachments', operation: 'update', payload: { record_id: args.record.id } });
  expect(mockEnqueue).toHaveBeenNthCalledWith(2, { id: 'ext-1', table: 'receipt_extractions', operation: 'update', payload: { corrected_fields: ['odometer'] } });
  expect(onSaved).toHaveBeenCalledWith(args.record.id);
});

test('a failed scan is a manual form that still links the photo, with no extraction', async () => {
  mockSave.mockClear(); mockEnqueue.mockClear();
  await render(
    <RecordForm vehicleId="v1" receipt={{ attachmentId: 'att-2', extractionId: null, draft: null }} onSaved={jest.fn()} onCancel={jest.fn()} />,
    { wrapper },
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Add item' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  const args = mockSave.mock.calls[0]![0] as { record: Record<string, unknown> };
  expect(args.record).toMatchObject({ source: 'manual', extraction_id: null });
  expect(mockEnqueue).toHaveBeenCalledTimes(1);
  expect(mockEnqueue).toHaveBeenCalledWith({ id: 'att-2', table: 'attachments', operation: 'update', payload: { record_id: args.record.id } });
});
