import { Pressable, Text, ActivityIndicator, View, type PressableProps } from 'react-native';
import { useTheme } from '../../theme/useTheme';

type Variant = 'primary' | 'secondary' | 'destructive' | 'destructive-outline';

type Props = Omit<PressableProps, 'children'> & {
  label: string;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  height?: number;
  fontSize?: number;
  fullWidth?: boolean;
  iconLeft?: React.ReactNode;
};

export function Button({
  label,
  variant = 'primary',
  loading,
  disabled,
  height = 56,
  fontSize,
  fullWidth = true,
  iconLeft,
  style,
  ...rest
}: Props) {
  const { c, radius } = useTheme();
  const isDisabled = disabled || loading;

  const bg =
    variant === 'primary'
      ? c.ink
      : variant === 'destructive'
        ? c.red
        : 'transparent';
  const fg =
    variant === 'primary'
      ? c.bg
      : variant === 'destructive'
        ? '#FFFFFF'
        : variant === 'destructive-outline'
          ? c.red
          : c.ink;
  const border =
    variant === 'secondary'
      ? c.line2
      : variant === 'destructive-outline'
        ? 'rgba(226,107,92,0.3)'
        : 'transparent';

  return (
    <Pressable
      {...rest}
      disabled={isDisabled}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          height,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
          paddingHorizontal: 20,
          borderWidth: variant === 'secondary' || variant === 'destructive-outline' ? 1.5 : 0,
          borderColor: border,
          opacity: isDisabled ? 0.55 : pressed ? 0.85 : 1,
          width: fullWidth ? '100%' : undefined,
        },
        typeof style === 'function' ? undefined : style,
      ]}
    >
      {iconLeft}
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text
          style={{
            color: fg,
            fontSize: fontSize ?? 16,
            fontWeight: '600',
            letterSpacing: -0.1,
          }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

// Round icon button — used for recenter, search, etc.
export function IconCircle({
  children,
  size = 48,
  variant = 'card',
  onPress,
  style,
}: {
  children: React.ReactNode;
  size?: number;
  variant?: 'card' | 'dark';
  onPress?: () => void;
  style?: PressableProps['style'];
}) {
  const { c, shadow } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: variant === 'dark' ? c.ink : c.card,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.85 : 1,
        },
        shadow.cardLight,
        typeof style === 'function' ? undefined : style,
      ]}
    >
      {children}
    </Pressable>
  );
}

// CTA bar — bottom-pinned button (or button stack) with a soft fade behind.
export function CTABar({ children }: { children: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: 24,
        paddingTop: 16,
        paddingBottom: 32,
        backgroundColor: c.bg,
        gap: 10,
      }}
    >
      {children}
    </View>
  );
}
