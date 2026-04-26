import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen,
  Card,
  H1,
  Body,
  Muted,
  Row,
  Chip,
  SectionHeader,
  Button,
} from '../../src/components/ui';
import { ChevronLeft, ChevronRight } from '../../src/components/icons/Icon';
import { useTheme } from '../../src/theme/useTheme';
import { useAuth } from '../../src/state/auth';

export default function Settings() {
  const router = useRouter();
  const { c } = useTheme();
  const session = useAuth((s) => s.session);
  const email = session?.user.email ?? '';

  const items = [
    'Edit profile photo',
    'Edit name',
    `Email · ${email}`,
    'Phone · Verify',
  ];

  return (
    <Screen scroll contentStyle={{ paddingBottom: 40 }}>
      <Pressable onPress={() => router.back()} style={{ paddingTop: 8 }}>
        <ChevronLeft />
      </Pressable>
      <H1 style={{ marginTop: 14 }}>Settings</H1>

      <SectionHeader>Account</SectionHeader>
      <Card padding={0} style={{ overflow: 'hidden' }}>
        {items.map((label, i) => (
          <View
            key={label}
            style={{
              paddingVertical: 14,
              paddingHorizontal: 16,
              borderBottomWidth: i < items.length - 1 ? 1 : 0,
              borderBottomColor: c.line,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <Body style={{ flex: 1, fontSize: 14 }}>{label}</Body>
            <ChevronRight color={c.muted2} />
          </View>
        ))}
      </Card>

      <SectionHeader>Preferences</SectionHeader>
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <View
          style={{
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderBottomWidth: 1,
            borderBottomColor: c.line,
          }}
        >
          <Body style={{ fontSize: 14 }}>Theme</Body>
          <Row gap={6} style={{ marginTop: 8 }}>
            <Chip label="Light" variant="outline" />
            <Chip label="Dark" variant="outline" />
            <Chip label="System" selected variant="outline" />
          </Row>
        </View>
        <Row
          between
          style={{
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderBottomWidth: 1,
            borderBottomColor: c.line,
          }}
        >
          <Body style={{ fontSize: 14 }}>Distance</Body>
          <Row gap={4}>
            <Chip label="km" selected variant="outline" />
            <Chip label="mi" variant="outline" />
          </Row>
        </Row>
        <Row
          between
          style={{ paddingVertical: 14, paddingHorizontal: 16 }}
        >
          <Body style={{ fontSize: 14 }}>Language · English</Body>
          <ChevronRight color={c.muted2} />
        </Row>
      </Card>

      <SectionHeader>Danger zone</SectionHeader>
      <Button label="Delete account" variant="destructive-outline" />
    </Screen>
  );
}
