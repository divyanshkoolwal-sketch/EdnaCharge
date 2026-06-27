import { View, Pressable, Text, Alert } from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import {
  Screen,
  Card,
  Body,
  Muted,
  Row,
  Avatar,
  Button,
  SectionHeader,
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
import { haptics } from '../../src/lib/haptics';
import { VerifiedPill } from '../../src/components/VerificationBanner';

const ITEMS: { key: string; label: string; icon: 'verify' | 'bolt' | 'card' | 'bell' | 'gear' | 'help'; path: string; params?: Record<string, string> }[] = [
  { key: 'verify', label: 'Verify ID', icon: 'verify', path: '/(shared)/identity-verification', params: { next: '/(host)/profile' } },
  { key: 'setup', label: 'My setup', icon: 'bolt', path: '/(host)/host-onboarding/charger-identification' },
  { key: 'card', label: 'Payment methods', icon: 'card', path: '/(shared)/payment-methods' },
  { key: 'bell', label: 'Notifications', icon: 'bell', path: '/(shared)/notifications' },
  { key: 'gear', label: 'Settings', icon: 'gear', path: '/(shared)/settings' },
  { key: 'help', label: 'Support', icon: 'help', path: '/(shared)/support' },
];

const ICON: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  verify: Star,
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
        <Row gap={6} style={{ marginTop: 10 }}>
          <Body style={{ fontWeight: '700', fontSize: 18 }}>
            {me.data?.fullName ?? 'You'}
          </Body>
          <VerifiedPill />
        </Row>
        <HostRatingRow userId={me.data?.id} createdAt={me.data?.createdAt ?? null} />
      </View>

      <Pressable
        onPress={() => {
          setRole('driver');
          router.replace('/(driver)/map');
        }}
        style={({ pressed }) => ({
          marginTop: 16,
          backgroundColor: '#C9E8C7',
          borderRadius: 18,
          borderWidth: 1,
          borderColor: '#6BB36C',
          padding: 16,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Row gap={10}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              backgroundColor: '#FFFFFF',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Bolt size={20} color="#3F7E40" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#0F0F10' }}>Switch to driver</Text>
            <Text style={{ fontSize: 12, color: 'rgba(15,15,16,0.7)', marginTop: 2 }}>
              Find chargers near you
            </Text>
          </View>
          <ChevronRight color="#0F0F10" />
        </Row>
      </Pressable>

      <SectionHeader>Account</SectionHeader>
      <Card padding={0} style={{ overflow: 'hidden' }}>
        {ITEMS.map((it, i) => {
          const Icon = ICON[it.icon]!;
          return (
            <Pressable
              key={it.key}
              accessibilityRole="button"
              accessibilityLabel={it.label}
              onPress={() => {
                haptics.selection();
                router.push(it.params ? { pathname: it.path, params: it.params } as never : it.path as never);
              }}
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
        onPress={() => {
          Alert.alert('Sign out?', 'You can sign back in anytime.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Sign out',
              style: 'destructive',
              onPress: async () => {
                await signOut();
                router.replace('/(auth)/welcome');
              },
            },
          ]);
        }}
        style={{ marginTop: 18 }}
      />
      <Muted style={{ textAlign: 'center', marginTop: 16, fontSize: 11 }}>
        EdnaCharge v{Constants.expoConfig?.version ?? '0.0.1'}
      </Muted>
    </Screen>
  );
}

function HostRatingRow({ userId, createdAt }: { userId: string | undefined; createdAt: Date | string | null }) {
  const summary = trpc.review.summary.useQuery({ userId: userId! }, { enabled: !!userId });
  const count = summary.data?.count ?? 0;
  const avg = summary.data?.avg;
  const since = createdAt
    ? new Date(createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : null;
  return (
    <Row gap={4}>
      {count > 0 && typeof avg === 'number' ? (
        <>
          <Star size={11} />
          <Muted>
            {avg.toFixed(1)}
            {since ? ` · Host since ${since}` : ''}
          </Muted>
        </>
      ) : (
        <Muted>{since ? `Host since ${since}` : 'New host'}</Muted>
      )}
    </Row>
  );
}
