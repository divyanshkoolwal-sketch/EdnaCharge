/** @file apps/mobile/src/components/ui/Avatar.tsx. */
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '../../theme/useTheme';

type Size = 'sm' | 'md' | 'lg';

const dims: Record<Size, { box: number; font: number }> = {
  sm: { box: 32, font: 12 },
  md: { box: 40, font: 14 },
  lg: { box: 64, font: 22 },
};

export function Avatar({
  name = 'EC',
  size = 'md',
  bgColor,
  uri,
}: {
  name?: string;
  size?: Size;
  bgColor?: string;
  /** Optional avatar image (profile picture / OAuth photo). Falls back to initials. */
  uri?: string | null;
}) {
  const { c } = useTheme();
  const { box, font } = dims[size];
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((s) => s[0] ?? '')
    .join('')
    .toUpperCase();

  if (uri) {
    return (
      <Image
        accessible
        accessibilityLabel={name && name !== 'EC' ? `${name}, profile photo` : 'Profile photo'}
        source={{ uri }}
        style={{ width: box, height: box, borderRadius: box / 2, backgroundColor: c.greenPill }}
        contentFit="cover"
        transition={150}
        cachePolicy="memory-disk"
      />
    );
  }

  return (
    <View
      accessible
      accessibilityLabel={name && name !== 'EC' ? `${name}, avatar` : 'Avatar'}
      style={{
        width: box,
        height: box,
        borderRadius: box / 2,
        backgroundColor: bgColor ?? c.greenPill,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          color: c.green2,
          fontWeight: '700',
          fontSize: font,
        }}
      >
        {initials || 'EC'}
      </Text>
    </View>
  );
}
