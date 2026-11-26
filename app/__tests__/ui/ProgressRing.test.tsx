// T066 — the vehicle health ring: progress drawn as a stroke dash, an accessible label, and
// Garage due chips with counts.
import { render, screen } from '@testing-library/react-native';
import '@/i18n';
import { ProgressRing } from '@/ui/components/ProgressRing';
import { DueChips } from '@/features/reminders/DueChips';
import { ThemeProvider } from '@/ui/theme';
import { palettes } from '@/ui/tokens';

jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), selectionAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));
const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;

test('the ring draws the share as the dash and has an accessible label', async () => {
  await render(<ProgressRing progress={0.25} tone="accent" size={40} accessibilityLabel="1 of 4 reminders on track" />, { wrapper });
  const ring = screen.getByLabelText('1 of 4 reminders on track');
  expect(ring.props.accessibilityRole).toBe('progressbar');
  expect(ring.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 25 });
  const arc = screen.getByTestId('progress-arc');
  const c = 2 * Math.PI * ((40 - 4) / 2);
  expect(arc.props.strokeDasharray).toEqual([c, c]);
  expect(Number(arc.props.strokeDashoffset)).toBeCloseTo(c * 0.75);
  // react-native-svg passes colors as ARGB integers
  const argb = (hex: string) => (0xff000000 | parseInt(hex.slice(1), 16)) >>> 0;
  expect(arc.props.stroke).toEqual({ type: 0, payload: argb(palettes.light.accent) });
});

test('progress is clamped to 0–1', async () => {
  await render(<ProgressRing progress={3} tone="success" accessibilityLabel="ring" />, { wrapper });
  expect(screen.getByLabelText('ring').props.accessibilityValue.now).toBe(100);
});

test('due chips show overdue and due-soon counts, nothing when all is on track', async () => {
  await render(<DueChips health={{ score: 0.5, overdue: 1, dueSoon: 2, tracked: 6, tone: 'danger' }} />, { wrapper });
  expect(screen.getByText('1 overdue')).toBeTruthy();
  expect(screen.getByText('2 due soon')).toBeTruthy();
  await render(<DueChips health={{ score: 1, overdue: 0, dueSoon: 0, tracked: 3, tone: 'success' }} />, { wrapper });
  expect(screen.getByText('All on track')).toBeTruthy();
});
