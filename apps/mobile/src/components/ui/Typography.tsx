import { Text, View, type TextProps, type ViewProps } from 'react-native';
import { useTheme } from '../../theme/useTheme';

export function H1(props: TextProps) {
  const { c, fontSize, fontWeight } = useTheme();
  return (
    <Text
      {...props}
      style={[
        {
          color: c.ink,
          fontSize: fontSize.h1,
          fontWeight: fontWeight.bold,
          letterSpacing: -0.5,
          lineHeight: fontSize.h1 * 1.1,
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
      {...props}
      style={[
        {
          color: c.ink,
          fontSize: fontSize.h1Lg,
          fontWeight: fontWeight.bold,
          letterSpacing: -0.5,
          lineHeight: fontSize.h1Lg * 1.1,
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
      {...props}
      style={[
        {
          color: c.ink,
          fontSize: fontSize.h2,
          fontWeight: fontWeight.bold,
          letterSpacing: -0.2,
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
          lineHeight: fontSize.body * 1.4,
        },
        props.style,
      ]}
    />
  );
}

export function Muted(props: TextProps) {
  const { c, fontSize } = useTheme();
  return (
    <Text
      {...props}
      style={[
        {
          color: c.muted,
          fontSize: 12,
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
    />
  );
}
