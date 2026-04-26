import { View, type ViewProps } from 'react-native';
import { useTheme } from '../../theme/useTheme';

type Props = ViewProps & {
  flat?: boolean;
  padding?: number;
};

export function Card({ flat, padding, style, children, ...rest }: Props) {
  const { c, radius, shadow } = useTheme();
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: c.card,
          borderRadius: radius.card,
          padding,
        },
        flat
          ? { borderWidth: 1, borderColor: c.line }
          : shadow.card,
        style,
      ]}
    >
      {children}
    </View>
  );
}

// Frame-soft from the design — outlined, no shadow, subtle padding container.
export function FrameSoft({ padding = 14, style, children, ...rest }: ViewProps & { padding?: number }) {
  const { c, radius } = useTheme();
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: c.card,
          borderRadius: radius.illo,
          borderWidth: 1,
          borderColor: c.line,
          padding,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
