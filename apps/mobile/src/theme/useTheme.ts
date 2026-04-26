import { useColorScheme } from 'react-native';
import {
  lightColors,
  darkColors,
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

export function useTheme(): Theme {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  return {
    isDark,
    c: isDark ? darkColors : lightColors,
    radius,
    space,
    fontSize,
    fontWeight,
    fontFamily,
    shadow,
  };
}
