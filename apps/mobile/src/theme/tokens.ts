// Design tokens lifted from EdnaCharge design canvas (styles.css).
// Single source of truth for colors / radii / typography across all screens.

export type ColorTokens = {
  bg: string;
  card: string;
  ink: string;
  ink2: string;
  muted: string;
  muted2: string;
  line: string;
  line2: string;
  green: string;
  green2: string;
  greenPill: string;
  orange: string;
  orangePill: string;
  red: string;
  redPill: string;
  yellow: string;
  chip: string;
  // Semantic aliases (status/feedback). Screens were hardcoding these hexes;
  // naming them keeps feedback colors consistent and themeable.
  success: string;
  warning: string;
  warningPill: string;
  error: string;
  info: string;
};

export const lightColors: ColorTokens = {
  bg: '#FAF9F6',
  card: '#FFFFFF',
  ink: '#0F0F10',
  ink2: '#2A2A2D',
  muted: '#6B6B70',
  muted2: '#A4A4A8',
  line: 'rgba(15,15,16,0.07)',
  line2: 'rgba(15,15,16,0.12)',
  green: '#B8E0B6',
  green2: '#6BB36C',
  greenPill: '#C9E8C7',
  orange: '#F2A66A',
  orangePill: 'rgba(242,166,106,0.20)',
  red: '#E26B5C',
  redPill: 'rgba(226,107,92,0.15)',
  yellow: '#F4E58A',
  chip: '#F2F1ED',
  success: '#6BB36C',
  warning: '#D8954E',
  warningPill: 'rgba(216,149,78,0.18)',
  error: '#E26B5C',
  info: '#4A86C5',
};

export const darkColors: ColorTokens = {
  bg: '#0E0E0F',
  card: '#1A1A1C',
  ink: '#FAFAF8',
  ink2: '#E5E5E3',
  muted: '#9D9DA1',
  muted2: '#6A6A6E',
  line: 'rgba(255,255,255,0.08)',
  line2: 'rgba(255,255,255,0.14)',
  green: '#5C8F5D',
  green2: '#A9DCAA',
  greenPill: 'rgba(108,179,108,0.25)',
  orange: '#D88A55',
  orangePill: 'rgba(216,138,85,0.22)',
  red: '#C8584C',
  redPill: 'rgba(200,88,76,0.20)',
  yellow: '#B5A75A',
  chip: '#232325',
  success: '#A9DCAA',
  warning: '#D8954E',
  warningPill: 'rgba(216,149,78,0.22)',
  error: '#C8584C',
  info: '#6AA6E0',
};

export const radius = {
  pill: 999,
  card: 22,
  cardLg: 28,
  input: 14,
  illo: 18,
  chip: 999,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const fontSize = {
  label: 11,
  micro: 10,
  body: 13,
  bodyLg: 14,
  input: 15,
  h2: 17,
  h1: 28,
  h1Lg: 32,
  display: 56,
  displayLg: 76,
} as const;

export const fontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  black: '800' as const,
};

// iOS uses SF Pro by default; Android uses Roboto. Both render the
// design's geometric-sans look acceptably without bundling a font file.
// Plus Jakarta Sans can be added later via expo-font without changing
// any consumer code; just point fontFamily here at the loaded family.
export const fontFamily = {
  regular: undefined as string | undefined,
  medium: undefined as string | undefined,
  bold: undefined as string | undefined,
};

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 14,
    elevation: 3,
  },
  cardLight: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  pillFloat: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 14,
    elevation: 6,
  },
} as const;
