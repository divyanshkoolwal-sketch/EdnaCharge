import { View, Text } from 'react-native';
import { useTheme } from '../../theme/useTheme';

export function Stepper({
  count,
  current,
  label,
}: {
  count: number;
  current: number;
  label?: string;
}) {
  const { c, fontSize, fontWeight } = useTheme();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${Math.min(current + 1, count)} of ${count}`}
    >
      {label ? (
        <Text
          style={{
            color: c.muted2,
            fontSize: fontSize.label,
            fontWeight: fontWeight.medium,
            letterSpacing: 0.2,
            marginBottom: 8,
          }}
        >
          {label.toUpperCase()}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {Array.from({ length: count }).map((_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 3,
              borderRadius: 2,
              backgroundColor: i <= current ? c.ink : c.line,
            }}
          />
        ))}
      </View>
    </View>
  );
}
