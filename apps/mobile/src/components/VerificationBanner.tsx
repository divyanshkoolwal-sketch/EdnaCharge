/**
 * Banner shown on both driver and host home screens to nudge unverified
 * users toward identity verification. The CTA routes to the shared
 * identity-verification screen with a `next` param so success continues
 * back to the home screen.
 *
 * Hidden when the user is already verified — replaced by a small green
 * "Verified" pill on the profile screens.
 */

import { Pressable, View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { trpc } from '../lib/trpc';
import { ChevronRight } from './icons/Icon';

type Props = {
  /** Where to land after a successful verification. */
  next: string;
  /** Role-flavored copy. */
  role: 'driver' | 'host';
};

export function VerificationBanner({ next, role }: Props) {
  const router = useRouter();
  const status = trpc.auth.identityVerificationStatus.useQuery();

  // Verified: show nothing (the home screen has space, verified pill lives on profile).
  if (status.data?.status === 'verified') return null;

  const isProcessing = status.data?.status === 'processing';
  const isFailed = status.data?.status === 'requires_input';

  const tone = isFailed
    ? { bg: 'rgba(226,107,92,0.10)', border: '#E26B5C', dot: '#E26B5C' }
    : isProcessing
      ? { bg: 'rgba(242,166,106,0.18)', border: '#D8954E', dot: '#D8954E' }
      : { bg: '#FFF6D9', border: '#D4A82A', dot: '#D4A82A' };

  const title = isFailed
    ? 'Verification needs attention'
    : isProcessing
      ? 'Verification in progress'
      : 'Verify your ID';

  const subtitle =
    role === 'driver'
      ? isFailed
        ? "Tap to retry — you can't book until you're verified."
        : isProcessing
          ? "We're checking your documents. This usually takes a few seconds."
          : 'Required before you can book your first charging session.'
      : isFailed
        ? "Tap to retry — you can't list a charger until you're verified."
        : isProcessing
          ? "We're checking your documents. This usually takes a few seconds."
          : 'Required before you can list a charger.';

  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: '/(shared)/identity-verification',
          params: { next },
        } as never)
      }
      style={({ pressed }) => ({
        marginTop: 12,
        backgroundColor: tone.bg,
        borderWidth: 1,
        borderColor: tone.border,
        borderRadius: 14,
        paddingVertical: 12,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: tone.dot,
        }}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F0F10' }}>{title}</Text>
        <Text style={{ fontSize: 11, color: '#3D3D40', marginTop: 2 }}>{subtitle}</Text>
      </View>
      <ChevronRight color="#0F0F10" />
    </Pressable>
  );
}

/**
 * Compact pill shown next to the user's name on profile / detail screens.
 * Render only when `status === 'verified'`.
 */
export function VerifiedPill({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const status = trpc.auth.identityVerificationStatus.useQuery();
  if (status.data?.status !== 'verified') return null;
  const padding = size === 'md' ? 8 : 6;
  const fontSize = size === 'md' ? 12 : 10;
  return (
    <View
      style={{
        backgroundColor: '#C9E8C7',
        paddingHorizontal: padding + 4,
        paddingVertical: padding - 2,
        borderRadius: 999,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
      }}
    >
      <Text style={{ fontSize, color: '#3F7E40', fontWeight: '800' }}>✓ Verified</Text>
    </View>
  );
}
