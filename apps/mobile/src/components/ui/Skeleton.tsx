import { View, type ViewStyle, type DimensionValue } from 'react-native';
import { useTheme } from '../../theme/useTheme';

/**
 * Static skeleton placeholder (no animation library → safe on any build).
 * Replaces blank screens / bare spinners while a query is loading.
 */
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
  return (
    <View
      style={[{ width, height, borderRadius: r ?? radius.input, backgroundColor: c.chip }, style]}
    />
  );
}

/** A card-shaped skeleton row, matching the list Card silhouette. */
export function SkeletonCard() {
  const { c, radius } = useTheme();
  return (
    <View
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
    </View>
  );
}

/** A stack of skeleton cards for a list's loading state. */
export function ListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View style={{ gap: 10 }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  );
}
