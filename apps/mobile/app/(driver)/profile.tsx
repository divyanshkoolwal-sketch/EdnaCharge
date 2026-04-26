import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen,
  H1,
  Card,
  Avatar,
  Row,
  Body,
  Muted,
  Button,
  SectionHeader,
} from '../../src/components/ui';
import { Star, Bolt, Card as CardIcon, Bell, Gear, Help, ChevronRight } from '../../src/components/icons/Icon';
import { useTheme } from '../../src/theme/useTheme';
import { trpc } from '../../src/lib/trpc';
import { useAuth } from '../../src/state/auth';
import { useRole } from '../../src/state/role';

const ITEMS: { key: string; label: string; icon: 'card' | 'bell' | 'gear' | 'help'; path: string }[] = [
  { key: 'card', label: 'Payment methods', icon: 'card', path: '/(shared)/payment-methods' },
  { key: 'bell', label: 'Notifications', icon: 'bell', path: '/(shared)/notifications' },
  { key: 'gear', label: 'Settings', icon: 'gear', path: '/(shared)/settings' },
  { key: 'help', label: 'Support', icon: 'help', path: '/(shared)/support' },
];

const ICON: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  card: CardIcon,
  bell: Bell,
  gear: Gear,
  help: Help,
};

export default function Profile() {
  const router = useRouter();
  const { c } = useTheme();
  const me = trpc.auth.getSession.useQuery();
  const setRole = useRole((s) => s.setRole);
  const signOut = useAuth((s) => s.signOut);
  const isHost = me.data?.roles.includes('host');

  return (
    <Screen scroll contentStyle={{ paddingBottom: 40 }}>
      <View style={{ marginTop: 14, alignItems: 'center' }}>
        <Avatar name={me.data?.fullName ?? 'EC'} size="lg" />
        <Body style={{ fontWeight: '700', fontSize: 18, marginTop: 10 }}>
          {me.data?.fullName ?? 'You'}
        </Body>
        <Row gap={4}>
          <Star size={11} />
          <Muted>4.8 · {me.data?.email}</Muted>
        </Row>
      </View>

      {/* Become a host card */}
      <Pressable
        onPress={() => {
          if (isHost) {
            setRole('host');
            router.replace('/(host)/home');
          } else {
            router.push('/(host)/host-onboarding/intro');
          }
        }}
        style={{ marginTop: 18 }}
      >
        <Card padding={14}>
          <Row gap={10}>
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                backgroundColor: c.greenPill,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Bolt size={18} color={c.green2} />
            </View>
            <View style={{ flex: 1 }}>
              <Body style={{ fontSize: 14, fontWeight: '700' }}>
                {isHost ? 'Switch to host' : 'Become a host'}
              </Body>
              <Muted style={{ fontSize: 11 }}>
                {isHost ? 'Open your host dashboard' : 'Earn $40–$200/mo on your home charger'}
              </Muted>
            </View>
            <ChevronRight color={c.muted2} />
          </Row>
        </Card>
      </Pressable>

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
