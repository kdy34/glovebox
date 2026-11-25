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

// The radiogroup View isn't an accessibility element itself (its radios are), so walk up to it.
const groupOf = (el: { parent: unknown }) => {
  let node = el.parent as { props: Record<string, unknown>; parent: unknown } | null;
  while (node && node.props.accessibilityRole !== 'radiogroup') node = node.parent as typeof node;
  if (!node) throw new Error('no radiogroup ancestor');
  return node;
};

// 002 T006 — seven fuel types don't fit one row: `layout="wrap"` wraps the options and keeps
// radio semantics and the selected fill.
test('SegmentedControl layout="wrap" wraps options and keeps radio semantics', async () => {
  const onChange = jest.fn();
  const options = [
    { value: 'gasoline', label: 'Gasoline' }, { value: 'diesel', label: 'Diesel' }, { value: 'hybrid', label: 'Hybrid' },
    { value: 'plug_in_hybrid', label: 'Plug-in hybrid' }, { value: 'electric', label: 'Electric' },
    { value: 'flex', label: 'Flex fuel' }, { value: 'other', label: 'Other' },
  ] as const;
  await render(
    <SegmentedControl label="Fuel type" layout="wrap" value="hybrid" onChange={onChange} options={options} />,
    { wrapper },
  );
  const group = groupOf(screen.getAllByRole('radio')[0]!);
  expect(group.props.accessibilityLabel).toBe('Fuel type');
  expect(flat(group).flexWrap).toBe('wrap');
  expect(screen.getAllByRole('radio')).toHaveLength(7);
  const hybrid = screen.getByRole('radio', { name: 'Hybrid' });
  expect(hybrid.props.accessibilityState).toMatchObject({ checked: true });
  expect(flat(hybrid).backgroundColor).toBe(palettes.light.selectedBg);
  const phev = screen.getByRole('radio', { name: 'Plug-in hybrid' });
  expect(flat(phev).flex).toBeUndefined(); // wrapped chips size by basis, not flex: 1
  await fireEvent.press(screen.getByRole('radio', { name: 'Electric' }));
  expect(onChange).toHaveBeenCalledWith('electric');
});

test('SegmentedControl default layout stays a single row', async () => {
  await render(
    <SegmentedControl label="Odometer unit" value="mi" onChange={jest.fn()} options={[{ value: 'mi', label: 'Miles' }, { value: 'km', label: 'Kilometers' }]} />,
    { wrapper },
  );
  expect(flat(groupOf(screen.getAllByRole('radio')[0]!)).flexWrap).toBeUndefined();
});
