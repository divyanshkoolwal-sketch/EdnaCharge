/** @file apps/mobile/app/(shared)/legal.tsx. */
import { View, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, H1, Body, Muted, SectionHeader } from '../../src/components/ui';
import { ChevronLeft } from '../../src/components/icons/Icon';
import { useTheme } from '../../src/theme/useTheme';
import { LEGAL_DOCS, LEGAL_UPDATED } from '../../src/content/legal';

export default function Legal() {
  const router = useRouter();
  const { c } = useTheme();
  const { doc } = useLocalSearchParams<{ doc?: string }>();
  const key = doc === 'terms' ? 'terms' : 'privacy';
  const content = LEGAL_DOCS[key];

  return (
    <Screen scroll contentStyle={{ paddingBottom: 48 }}>
      <Pressable
        onPress={() => router.back()}
        style={{ paddingTop: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={10}
      >
        <ChevronLeft />
      </Pressable>
      <H1 style={{ marginTop: 14 }}>{content.title}</H1>
      <Muted style={{ marginTop: 4, fontSize: 12 }}>Last updated {LEGAL_UPDATED}</Muted>
      <Body style={{ marginTop: 16, lineHeight: 22 }}>{content.intro}</Body>

      {content.blocks.map((block, i) => (
        <View key={block.heading ?? String(i)}>
          {block.heading ? <SectionHeader>{block.heading}</SectionHeader> : null}
          {block.body ? (
            <Body style={{ lineHeight: 22, color: c.muted }}>{block.body}</Body>
          ) : null}
          {block.bullets?.map((b, j) => (
            <View key={j} style={{ flexDirection: 'row', marginTop: 8, paddingRight: 6 }}>
              <Body style={{ color: c.muted2, marginRight: 8 }}>•</Body>
              <Body style={{ flex: 1, lineHeight: 22, color: c.muted }}>{b}</Body>
            </View>
          ))}
        </View>
      ))}
    </Screen>
  );
}
