import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen,
  Card,
  H1,
  Body,
  Muted,
  Row,
  Avatar,
  Button,
  SectionHeader,
  Chip,
} from '../../src/components/ui';
import {
  Bolt,
  Card as CardIcon,
  Bell,
  Gear,
  Help,
  Star,
  ChevronRight,
} from '../../src/components/icons/Icon';
import { useTheme } from '../../src/theme/useTheme';
import { useRole } from '../../src/state/role';
import { useAuth } from '../../src/state/auth';
import { trpc } from '../../src/lib/trpc';

const ITEMS: { key: string; label: string; icon: 'bolt' | 'card' | 'bell' | 'gear' | 'help'; path: string }[] = [
  { key: 'setup', label: 'My setup', icon: 'bolt', path: '/(host)/host-onboarding/charger-identification' },
  { key: 'card', label: 'Payment methods', icon: 'card', path: '/(shared)/payment-methods' },
  { key: 'bell', label: 'Notifications', icon: 'bell', path: '/(shared)/notifications' },
  { key: 'gear', label: 'Settings', icon: 'gear', path: '/(shared)/settings' },
  { key: 'help', label: 'Support', icon: 'help', path: '/(shared)/support' },
];

const ICON: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  bolt: Bolt,
  card: CardIcon,
  bell: Bell,
  gear: Gear,
  help: Help,
};

export default function HostProfile() {
  const router = useRouter();
  const { c } = useTheme();
  const setRole = useRole((s) => s.setRole);
  const signOut = useAuth((s) => s.signOut);
  const me = trpc.auth.getSession.useQuery();

  return (
    <Screen scroll contentStyle={{ paddingBottom: 30 }}>
      <View style={{ marginTop: 14, alignItems: 'center' }}>
        <Avatar name={me.data?.fullName ?? 'EC'} size="lg" />
        <Body style={{ fontWeight: '700', fontSize: 18, marginTop: 10 }}>
          {me.data?.fullName ?? 'You'}
        </Body>
        <Row gap={4}>
          <Star size={11} />
          <Muted>4.9 · Host since Jan 2026</Muted>
        </Row>
      </View>

      <Card padding={12} style={{ marginTop: 16 }}>
        <Row gap={10}>
          <Chip label="HOST" variant="dark" />
          <View style={{ flex: 1 }} />
          <Pressable
            onPress={() => {
              setRole('driver');
              router.replace('/(driver)/map');
            }}
          >
            <Body style={{ fontSize: 13, fontWeight: '600' }}>Switch to driver</Body>
          </Pressable>
        </Row>
      </Card>

      <SectionHeader>Account</SectionHeader>
      <Card padding={0} style={{ overflow: 'hidden' }}>
        {ITEMS.map((it, i) => {
          const Icon = ICON[it.icon]!;
          return (
            <Pressable
              key={it.key}
              onPress={() => router.push(it.path as never)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 14,
                paddingHorizontal: 16,
                borderBottomWidth: i < ITEMS.length - 1 ? 1 : 0,
                borderBottomColor: c.line,
              }}
            >
              <Icon size={16} color={c.muted} />
              <Body style={{ flex: 1, fontSize: 14 }}>{it.label}</Body>
              <ChevronRight color={c.muted2} />
            </Pressable>
          );
        })}
      </Card>

      <Button
        label="Sign out"
        variant="destructive-outline"
        onPress={() => signOut()}
        style={{ marginTop: 18 }}
      />
    </Screen>
  );
}
