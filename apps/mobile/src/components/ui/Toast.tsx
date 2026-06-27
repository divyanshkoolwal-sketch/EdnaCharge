import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/useTheme';
import { haptics } from '../../lib/haptics';

/**
 * Lightweight, dependency-free toast (no native module). World-class apps
 * confirm actions with a brief, non-blocking banner instead of a modal Alert —
 * this gives every mutation a success/error confirmation. Animated with RN's
 * built-in Animated (no Reanimated worklets, per project constraint) and
 * announced to screen readers via accessibilityLiveRegion.
 */
type ToastVariant = 'default' | 'success' | 'error';
type ToastInput = { message: string; variant?: ToastVariant };

type ToastContextValue = { show: (message: string, variant?: ToastVariant) => void };

const ToastContext = createContext<ToastContextValue>({ show: () => {} });

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastInput | null>(null);
  const translateY = useRef(new Animated.Value(-80)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    Animated.parallel([
      Animated.timing(translateY, { toValue: -80, duration: 200, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setToast(null));
  }, [opacity, translateY]);

  const show = useCallback(
    (message: string, variant: ToastVariant = 'default') => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setToast({ message, variant });
      if (variant === 'success') haptics.success();
      else if (variant === 'error') haptics.error();
      translateY.setValue(-80);
      opacity.setValue(0);
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 9, tension: 80 }),
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
      hideTimer.current = setTimeout(dismiss, 2800);
    },
    [dismiss, opacity, translateY],
  );

  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  const bg =
    toast?.variant === 'success' ? c.green2 : toast?.variant === 'error' ? c.red : c.ink;

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast ? (
        <Animated.View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            top: insets.top + 8,
            left: 16,
            right: 16,
            transform: [{ translateY }],
            opacity,
          }}
        >
          <Pressable
            onPress={dismiss}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            accessibilityLabel={toast.message}
            style={{
              backgroundColor: bg,
              borderRadius: 14,
              paddingHorizontal: 16,
              paddingVertical: 13,
              flexDirection: 'row',
              alignItems: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.18,
              shadowRadius: 12,
              elevation: 6,
            }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '600', flex: 1 }}>
              {toast.message}
            </Text>
          </Pressable>
        </Animated.View>
      ) : (
        <View />
      )}
    </ToastContext.Provider>
  );
}
