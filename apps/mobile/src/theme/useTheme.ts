import {
  lightColors,
  radius,
  space,
  fontSize,
  fontWeight,
  fontFamily,
  shadow,
  type ColorTokens,
} from './tokens';

export type Theme = {
  isDark: boolean;
  c: ColorTokens;
  radius: typeof radius;
  space: typeof space;
  fontSize: typeof fontSize;
  fontWeight: typeof fontWeight;
  fontFamily: typeof fontFamily;
  shadow: typeof shadow;
};

// EdnaCharge is a light-themed app; the dark palette was never finished and
// was causing invisible text against white cards in iOS 26 simulators with
// the OS in dark mode. Lock everything to lightColors until a proper dark
// theme pass ships.
export function useTheme(): Theme {
  return {
    isDark: false,
    c: lightColors,
    radius,
    space,
    fontSize,
    fontWeight,
    fontFamily,
    shadow,
  };
}
