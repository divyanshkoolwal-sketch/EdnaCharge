/** @file apps/mobile/src/components/ui/Button.tsx. */
import { useEffect, useState } from 'react';
import {
  Pressable,
  Text,
  ActivityIndicator,
  View,
  Keyboard,
  Platform,
  type GestureResponderEvent,
  type PressableProps,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  onPress,
  ...rest
}: Props) {
  const { c, radius } = useTheme();
  const isDisabled = disabled || loading;

  // Light haptic on the primary CTAs (confirm / pay / accept) for iOS feel.
  const handlePress = (e: GestureResponderEvent) => {
    if (variant === 'primary' || variant === 'destructive') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress?.(e);
  };

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
      onPress={handlePress}
      disabled={isDisabled}
      // a11y on the primitive → every button in the app is screen-reader
      // friendly without per-call-site work. State announces disabled/busy.
      accessibilityRole="button"
      accessibilityLabel={rest.accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      accessibilityHint={
        rest.accessibilityHint ??
        (variant === 'destructive' || variant === 'destructive-outline'
          ? 'Performs a destructive action'
          : undefined)
      }
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
          opacity: isDisabled ? 0.55 : pressed ? 0.9 : 1,
          // Subtle tactile press feedback (no Reanimated worklet → safe + instant).
          transform: [{ scale: pressed && !isDisabled ? 0.985 : 1 }],
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
  accessibilityLabel,
}: {
  children: React.ReactNode;
  size?: number;
  variant?: 'card' | 'dark';
  onPress?: () => void;
  style?: PressableProps['style'];
  /** Icon-only buttons must be labeled for screen readers. */
  accessibilityLabel?: string;
}) {
  const { c, shadow } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: variant === 'dark' ? c.ink : c.card,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.9 : 1,
          transform: [{ scale: pressed ? 0.95 : 1 }],
        },
        shadow.cardLight,
        typeof style === 'function' ? undefined : style,
      ]}
    >
      {children}
    </Pressable>
  );
}

// CTA bar — bottom button (or button stack).
//
// Two modes:
//  - `inFlow` (set by <Screen> on scrollable/keyboard-aware screens): a normal
//    flex sibling below the ScrollView. The parent KeyboardAvoidingView lifts
//    the whole stack, so the bar sits flush above the keyboard and can NEVER
//    overlap the form. This is the correct, coordinated behavior.
//  - default (non-scrollable screens): classic absolute bottom-pinned bar that
//    tracks the keyboard height itself.
export function CTABar({ children, inFlow }: { children: React.ReactNode; inFlow?: boolean }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    // In-flow bars are lifted by the parent KeyboardAvoidingView — no listener.
    if (inFlow) return;
    // iOS fires Will* slightly ahead of the animation (smoother); Android only
    // reliably fires Did*.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) =>
      setKeyboardHeight(e.endCoordinates?.height ?? 0),
    );
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [inFlow]);

  if (inFlow) {
    // Normal flex sibling — the KeyboardAvoidingView in <Screen> handles lift.
    // Parent already applies horizontal padding, so only pad top/bottom.
    return (
      <View
        style={{
          paddingTop: 16,
          paddingBottom: Math.max(16, insets.bottom),
          backgroundColor: c.bg,
          gap: 10,
        }}
      >
        {children}
      </View>
    );
  }

  const lifted = keyboardHeight > 0;
  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        // Sit just above the keyboard when it's open; otherwise pin to the
        // bottom with the safe-area gap.
        bottom: lifted ? keyboardHeight : 0,
        paddingHorizontal: 24,
        paddingTop: 16,
        paddingBottom: lifted ? 12 : 32,
        backgroundColor: c.bg,
        gap: 10,
      }}
    >
      {children}
    </View>
  );
}
