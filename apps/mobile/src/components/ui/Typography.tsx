/** @file apps/mobile/src/components/ui/Typography.tsx. */
import { Text, View, StyleSheet, type TextProps, type ViewProps, type TextStyle } from 'react-native';
import { useTheme } from '../../theme/useTheme';

/**
 * When a caller overrides `fontSize` via the `style` prop, our default
 * `lineHeight` (computed from the base font size) is no longer correct and
 * the larger glyphs get clipped at the top/bottom. Resolve `lineHeight` from
 * the override fontSize so callers can size text freely without clipping.
 */
function resolveLineHeight(
  baseFontSize: number,
  multiplier: number,
  overrideStyle: TextProps['style'],
): number {
  const flat = StyleSheet.flatten(overrideStyle) as TextStyle | undefined;
  const effective = (flat && typeof flat.fontSize === 'number') ? flat.fontSize : baseFontSize;
  return Math.round(effective * multiplier);
}

export function H1(props: TextProps) {
  const { c, fontSize, fontWeight } = useTheme();
  return (
    <Text
      accessibilityRole="header"
      {...props}
      style={[
        {
          color: c.ink,
          fontSize: fontSize.h1,
          fontWeight: fontWeight.bold,
          letterSpacing: -0.5,
          lineHeight: resolveLineHeight(fontSize.h1, 1.15, props.style),
        },
        props.style,
      ]}
    />
  );
}

export function H1Lg(props: TextProps) {
  const { c, fontSize, fontWeight } = useTheme();
  return (
    <Text
      accessibilityRole="header"
      {...props}
      style={[
        {
          color: c.ink,
          fontSize: fontSize.h1Lg,
          fontWeight: fontWeight.bold,
          letterSpacing: -0.5,
          lineHeight: resolveLineHeight(fontSize.h1Lg, 1.15, props.style),
        },
        props.style,
      ]}
    />
  );
}

export function H2(props: TextProps) {
  const { c, fontSize, fontWeight } = useTheme();
  return (
    <Text
      accessibilityRole="header"
      {...props}
      style={[
        {
          color: c.ink,
          fontSize: fontSize.h2,
          fontWeight: fontWeight.bold,
          letterSpacing: -0.2,
          lineHeight: resolveLineHeight(fontSize.h2, 1.25, props.style),
        },
        props.style,
      ]}
    />
  );
}

export function Body(props: TextProps) {
  const { c, fontSize } = useTheme();
  return (
    <Text
      {...props}
      style={[
        {
          color: c.ink2,
          fontSize: fontSize.body,
          lineHeight: resolveLineHeight(fontSize.body, 1.4, props.style),
        },
        props.style,
      ]}
    />
  );
}

export function Muted(props: TextProps) {
  const { c } = useTheme();
  return (
    <Text
      {...props}
      style={[
        {
          color: c.muted,
          fontSize: 12,
          lineHeight: resolveLineHeight(12, 1.4, props.style),
        },
        props.style,
      ]}
    />
  );
}

export function Label(props: TextProps) {
  const { c, fontSize, fontWeight } = useTheme();
  return (
    <Text
      {...props}
      style={[
        {
          color: c.muted2,
          fontSize: fontSize.label,
          fontWeight: fontWeight.medium,
          letterSpacing: 0.2,
          lineHeight: resolveLineHeight(fontSize.label, 1.4, props.style),
        },
        props.style,
      ]}
    />
  );
}

// Section header: bold H2 with optional right action.
export function SectionHeader({
  children,
  action,
  marginTop = 18,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  marginTop?: number;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop,
        marginBottom: 10,
      }}
    >
      <H2>{children}</H2>
      {action}
    </View>
  );
}

export function Divider() {
  const { c } = useTheme();
  return <View style={{ height: 1, backgroundColor: c.line, marginVertical: 12 }} />;
}

export function Row({
  children,
  gap = 10,
  between,
  style,
  ...rest
}: ViewProps & { gap?: number; between?: boolean }) {
  return (
    <View
      {...rest}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap,
          justifyContent: between ? 'space-between' : 'flex-start',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
