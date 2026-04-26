import { View, Pressable, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen,
  Card,
  H1,
  Body,
  Muted,
  Row,
  Button,
  SectionHeader,
} from '../../src/components/ui';
import { ChevronLeft, Search, ChevronRight } from '../../src/components/icons/Icon';
import { useTheme } from '../../src/theme/useTheme';

const FAQS = [
  'What is a pre-auth?',
  'Why was my booking declined?',
  'How do payouts work?',
  'Can I cancel after starting?',
  'Connector compatibility',
];

export default function Support() {
  const router = useRouter();
  const { c } = useTheme();
  return (
    <Screen scroll contentStyle={{ paddingBottom: 40 }}>
      <Pressable onPress={() => router.back()} style={{ paddingTop: 8 }}>
        <ChevronLeft />
      </Pressable>
      <H1 style={{ marginTop: 14 }}>Help</H1>

      <Card
        padding={14}
        style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 10, height: 48 }}
      >
        <Search size={16} color={c.muted} />
        <Muted>Search articles…</Muted>
      </Card>

      <SectionHeader>Common questions</SectionHeader>
      <Card padding={0} style={{ overflow: 'hidden' }}>
        {FAQS.map((q, i) => (
          <Row
            between
            key={q}
            style={{
              paddingVertical: 14,
              paddingHorizontal: 16,
              borderBottomWidth: i < FAQS.length - 1 ? 1 : 0,
              borderBottomColor: c.line,
            }}
          >
            <Body style={{ flex: 1, fontSize: 13 }}>{q}</Body>
            <ChevronRight color={c.muted2} />
          </Row>
        ))}
      </Card>

      <Button
        label="Contact support"
        onPress={() => Linking.openURL('mailto:support@ednacharge.com')}
        style={{ marginTop: 18 }}
      />
    </Screen>
  );
}
