// T103a — the Miles/Kilometers selector: the selected option was white text on a transparent
// background, because Button let a caller's `style` replace its own style (and its fill).
import { render, screen, fireEvent } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { Button, SegmentedControl } from '@/ui/components';
import { palettes } from '@/ui/tokens';
import { ThemeProvider } from '@/ui/theme';

const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;

jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), selectionAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));

const flat = (el: { props: Record<string, unknown> }) => {
  const s = el.props.style as unknown;
  const resolved = typeof s === "function" ? (s as (st: { pressed: boolean }) => unknown)({ pressed: false }) : s;
  return (StyleSheet.flatten(resolved as never) ?? {}) as Record<string, unknown>;
};

test('Button keeps its fill when the caller passes a style', async () => {
  await render(<Button title="Save" style={{ flex: 1 }} />, { wrapper });
  const style = flat(screen.getByRole('button', { name: 'Save' }));
  expect(style.flex).toBe(1);
  expect(style.backgroundColor).toBe(palettes.light.primary);
});

test('SegmentedControl fills the selected option navy and reports selection', async () => {
  const onChange = jest.fn();
  await render(
    <SegmentedControl
      label="Odometer unit"
      value="mi"
      onChange={onChange}
      options={[{ value: 'mi', label: 'Miles' }, { value: 'km', label: 'Kilometers' }]}
    />,
    { wrapper },
  );
  const miles = screen.getByRole('radio', { name: 'Miles' });
  const km = screen.getByRole('radio', { name: 'Kilometers' });
  expect(miles.props.accessibilityState).toMatchObject({ checked: true });
  expect(flat(miles).backgroundColor).toBe(palettes.light.selectedBg);
  expect(flat(km).backgroundColor).not.toBe(palettes.light.selectedBg);
  expect(screen.getByText('Miles').props.style).toEqual(expect.arrayContaining([expect.objectContaining({ color: palettes.light.onSelected })]));
  await fireEvent.press(km);
  expect(onChange).toHaveBeenCalledWith('km');
});
