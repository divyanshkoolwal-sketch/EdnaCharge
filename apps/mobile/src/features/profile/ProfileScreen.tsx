/** @file apps/mobile/src/features/profile/ProfileScreen.tsx. */
import { Alert, Pressable, Text, View } from 'react-native';
import Constants from 'expo-constants';
import * as StoreReview from 'expo-store-review';
import { useRouter } from 'expo-router';
import { Avatar, Body, Button, Card, Muted, Row, Screen, SectionHeader } from '../../components/ui';
import {
  Bell,
  Bolt,
  Card as CardIcon,
  ChevronRight,
  Gear,
  Help,
  Star,
} from '../../components/icons/Icon';
import { RatingsSection } from '../../components/RatingsSection';
import { VerifiedPill } from '../../components/VerificationBanner';
import { haptics } from '../../lib/haptics';
import { hasRoleAccess } from '../../lib/authRouting';
import { hostEntryRoute, hostStage } from '../../lib/hostEntry';
import { trpc } from '../../lib/trpc';
import { useAuth } from '../../state/auth';
import { useRole } from '../../state/role';
import { useTheme } from '../../theme/useTheme';
import { ProfileRatingRow } from './ProfileRatingRow';

type ProfileRole = 'driver' | 'host';
type Item = {
  key: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  path?: string;
  params?: Record<string, string>;
  action?: 'rate';
};

function profileItems(role: ProfileRole): Item[] {
  return [
    {
      key: 'verify',
      label: 'Verify ID',
      Icon: Star,
      path: '/(shared)/identity-verification',
      params: { next: role === 'driver' ? '/(driver)/profile' : '/(host)/profile' },
    },
    ...(role === 'host'
      ? [
          {
            key: 'setup',
            label: 'My setup',
            Icon: Bolt,
            path: '/(host)/host-onboarding/charger-identification',
          },
        ]
      : []),
    { key: 'card', label: 'Payment methods', Icon: CardIcon, path: '/(shared)/payment-methods' },
    {
      key: 'bell',
      label: 'Notifications',
      Icon: Bell,
      path: `/(shared)/notifications?role=${role}`,
    },
    { key: 'gear', label: 'Settings', Icon: Gear, path: '/(shared)/settings' },
    { key: 'help', label: 'Support', Icon: Help, path: '/(shared)/support' },
    { key: 'rate', label: 'Rate EdnaCharge', Icon: Star, action: 'rate' },
  ];
}

async function rateApp() {
  try {
    if (await StoreReview.isAvailableAsync()) {
      await StoreReview.requestReview();
    } else {
      Alert.alert('Thanks!', 'You can rate EdnaCharge from the App Store.');
    }
  } catch {
    Alert.alert('Thanks!', 'You can rate EdnaCharge from the App Store.');
  }
}

export function ProfileScreen({ role }: { role: ProfileRole }) {
  const router = useRouter();
  const { c } = useTheme();
  const me = trpc.auth.getSession.useQuery();
  const setRole = useRole((s) => s.setRole);
  const signOut = useAuth((s) => s.signOut);
  const stage = hostStage(me.data);
  const canDriver = hasRoleAccess(me.data, 'driver');
  const canHost = hasRoleAccess(me.data, 'host');

  const switchTitle =
    role === 'host'
      ? canDriver
        ? 'Switch to driver'
        : 'Join driver waitlist'
      : stage === 'complete'
        ? 'Switch to host'
        : !canHost
          ? 'Enter host code'
        : stage === 'in_progress'
          ? 'Finish host setup'
          : 'Become a host';
  const switchSubtitle =
    role === 'host'
      ? canDriver
        ? 'Find chargers near you'
        : 'Drivers are opening by invite in Fremont'
      : stage === 'complete'
        ? 'Open your host dashboard'
        : !canHost
          ? 'Hosts are opening by field invite in Fremont'
        : stage === 'in_progress'
          ? 'Pick up where you left off'
          : 'Earn $40–$200/mo on your home charger';

  const switchRole = () => {
    if (role === 'host') {
      if (!canDriver) {
        router.push('/(auth)/access-gate?role=driver' as never);
        return;
      }
      setRole('driver');
      router.replace('/(driver)/map');
      return;
    }
    if (!canHost) {
      router.push('/(auth)/access-gate?role=host' as never);
      return;
    }
    if (stage === 'complete') {
      setRole('host');
      router.replace('/(host)/home');
    } else {
      router.push(hostEntryRoute(me.data) as never);
    }
  };

  return (
    <Screen scroll contentStyle={{ paddingBottom: role === 'driver' ? 40 : 30 }}>
      <Pressable
        onPress={() => router.push('/(shared)/edit-profile' as never)}
        accessibilityRole="button"
        accessibilityLabel="Edit profile"
        style={{ marginTop: 14, alignItems: 'center' }}
      >
        <Avatar name={me.data?.fullName ?? 'EC'} uri={me.data?.avatarUrl} size="lg" />
        <Row gap={6} style={{ marginTop: 10 }}>
          <Body style={{ fontWeight: '700', fontSize: 18 }}>{me.data?.fullName ?? 'You'}</Body>
          <VerifiedPill />
        </Row>
        <ProfileRatingRow role={role} me={me.data} />
        <Muted style={{ fontSize: 12, marginTop: 6 }}>Tap to edit profile</Muted>
      </Pressable>

      <Pressable
        onPress={switchRole}
        style={({ pressed }) => ({
          marginTop: role === 'driver' ? 18 : 16,
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
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#0F0F10' }}>{switchTitle}</Text>
            <Text style={{ fontSize: 12, color: 'rgba(15,15,16,0.7)', marginTop: 2 }}>
              {switchSubtitle}
            </Text>
          </View>
          <ChevronRight color="#0F0F10" />
        </Row>
      </Pressable>

      <SectionHeader>Account</SectionHeader>
      <Card padding={0} style={{ overflow: 'hidden' }}>
        {profileItems(role).map((it, i, items) => {
          const Icon = it.Icon;
          return (
            <Pressable
              key={it.key}
              accessibilityRole="button"
              accessibilityLabel={it.label}
              onPress={() => {
                haptics.selection();
                if (it.action === 'rate') {
                  rateApp();
                  return;
                }
                if (!it.path) return;
                router.push(
                  it.params
                    ? ({ pathname: it.path, params: it.params } as never)
                    : (it.path as never),
                );
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 14,
                paddingHorizontal: 16,
                borderBottomWidth: i < items.length - 1 ? 1 : 0,
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

      <RatingsSection userId={me.data?.id} />

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
