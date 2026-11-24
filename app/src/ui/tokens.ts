// Design tokens (plan.md "Design Direction"). Pure data — no React Native imports —
// so contrast can be unit-tested (constitution VII: WCAG 2.1 AA).

export type ColorToken =
  | 'bg' | 'surface' | 'surfaceAlt' | 'border'
  | 'text' | 'textMuted'
  | 'primary' | 'onPrimary'
  | 'accent' | 'onAccent' | 'accentText'
  | 'success' | 'successText' | 'warning' | 'warningText' | 'danger' | 'dangerText'
  | 'overlay';

export type Palette = Record<ColorToken, string>;

const ink = '#0F1B2D';
const amber = '#F2A900';

export const palettes: { light: Palette; dark: Palette } = {
  light: {
    bg: '#F7F5F0', // paper
    surface: '#FFFFFF',
    surfaceAlt: '#EFEBE3',
    border: '#D9D3C7',
    text: ink,
    textMuted: '#4A5568',
    primary: ink,
    onPrimary: '#FFFFFF',
    accent: amber, // fills only (chips, rings, highlights) — never small text on light bg
    onAccent: ink,
    accentText: '#8A5A00',
    success: '#2E9E6B',
    successText: '#1D7049',
    warning: '#F2A900',
    warningText: '#8A5A00',
    danger: '#D64545',
    dangerText: '#B02A2A',
    overlay: 'rgba(15,27,45,0.45)',
  },
  dark: {
    bg: '#0B1422',
    surface: '#13203A',
    surfaceAlt: '#1B2A47',
    border: '#2A3B5C',
    text: '#F4F1EA',
    textMuted: '#A9B4C6',
    primary: amber,
    onPrimary: ink,
    accent: amber,
    onAccent: ink,
    accentText: '#F5B829',
    success: '#3FBF86',
    successText: '#6FDCA8',
    warning: '#F2A900',
    warningText: '#F5B829',
    danger: '#E05A5A',
    dangerText: '#FF9A9A',
    overlay: 'rgba(0,0,0,0.6)',
  },
};

/** [foreground, background, minimum ratio] pairs actually used for text in the UI. */
export const textPairs: readonly [ColorToken, ColorToken, number][] = [
  ['text', 'bg', 4.5], ['text', 'surface', 4.5], ['text', 'surfaceAlt', 4.5],
  ['textMuted', 'bg', 4.5], ['textMuted', 'surface', 4.5], ['textMuted', 'surfaceAlt', 4.5],
  ['onPrimary', 'primary', 4.5], ['onAccent', 'accent', 4.5],
  ['accentText', 'surface', 4.5], ['accentText', 'bg', 4.5],
  ['successText', 'surface', 4.5], ['warningText', 'surface', 4.5], ['dangerText', 'surface', 4.5],
  ['successText', 'bg', 4.5], ['dangerText', 'bg', 4.5],
];

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

// SF Pro via the system font; sizes follow Apple's Dynamic Type "Large" defaults and scale with it.
export const type = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700' },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '600' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 22, fontWeight: '400' },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: '400' },
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
} as const;

export type TypeVariant = keyof typeof type;
