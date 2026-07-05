import { useEffect, useRef } from 'react';
import { Animated, type ViewStyle, type DimensionValue } from 'react-native';
import { useTheme } from '../../theme/useTheme';

/**
 * Skeleton placeholder with a gentle opacity pulse (RN Animated, native driver
 * — no Reanimated worklets). A pulsing skeleton reads as "loading" far better
 * than a static gray block or a bare spinner, and lowers perceived latency.
 */
function usePulse() {
  const v = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return v;
}

export function Skeleton({
  width = '100%',
  height = 14,
  radius: r,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}) {
  const { c, radius } = useTheme();
  const opacity = usePulse();
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width, height, borderRadius: r ?? radius.input, backgroundColor: c.chip, opacity },
        style,
      ]}
    />
  );
}

/** A card-shaped skeleton row, matching the list Card silhouette. */
export function SkeletonCard() {
  const { c, radius } = useTheme();
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        backgroundColor: c.card,
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: c.line,
        padding: 14,
        gap: 10,
      }}
    >
      <Skeleton width="60%" height={14} />
      <Skeleton width="40%" height={11} />
      <Skeleton width={84} height={22} radius={999} />
    </Animated.View>
  );
}

/** A stack of skeleton cards for a list's loading state. */
export function ListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <Animated.View
      accessibilityLabel="Loading"
      accessibilityRole="progressbar"
      style={{ gap: 10 }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </Animated.View>
  );
}
