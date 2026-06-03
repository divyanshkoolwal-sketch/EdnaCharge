import { View, ActivityIndicator, ScrollView, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { trpc } from '../../../src/lib/trpc';
import { useTheme } from '../../../src/theme/useTheme';
import { useUserLocation } from '../../../src/state/userLocation';
import { haversineKm, formatDistanceAndDriveTime } from '../../../src/lib/distance';
import {
  Screen,
  H1,
  H2,
  Body,
  Muted,
  SectionHeader,
  Row,
  Chip,
  StatusDot,
  TierBadge,
  Avatar,
  FrameSoft,
  Button,
  CTABar,
} from '../../../src/components/ui';
import { ChevronLeft, Star, Bolt } from '../../../src/components/icons/Icon';
import { ChargerIllo } from '../../../src/components/illustrations/HomeCharger';

export default function ChargerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { c } = useTheme();
  const q = trpc.charger.get.useQuery({ id: id! }, { enabled: !!id });
  const userCoords = useUserLocation((s) => s.coords);

  // Compute distance + a rough drive time using a 30 km/h heuristic (fine for
  // v1; an accurate ETA would need Mapbox Directions API). We render this on
  // the same row as the host name so the user can scan it instantly.
  const distanceLabel = (() => {
    if (!userCoords || !q.data) return null;
    const km = haversineKm(
      userCoords.lat,
      userCoords.lng,
      q.data.lat,
      q.data.lng,
    );
    return formatDistanceAndDriveTime(km);
  })();

  if (q.isLoading) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </Screen>
    );
  }
  if (q.error || !q.data) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Body>{q.error?.message ?? 'Not found'}</Body>
      </Screen>
    );
  }
  const ch = q.data;
  const priceMain = ch.pricePerKwhCents
    ? `$${(ch.pricePerKwhCents / 100).toFixed(2)}`
    : ch.pricePerHourCents
      ? `$${(ch.pricePerHourCents / 100).toFixed(2)}`
      : '—';
  const priceUnit = ch.pricePerKwhCents ? '/kWh' : ch.pricePerHourCents ? '/hour' : '';

  return (
    <Screen>
      <Pressable onPress={() => router.back()} style={{ paddingTop: 8 }}>
        <ChevronLeft />
      </Pressable>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
        {ch.photoUrl ? (
          <Image
            source={{ uri: ch.photoUrl }}
            style={{ width: '100%', height: 180, borderRadius: 18, marginTop: 14 }}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={{ marginTop: 14 }}>
            <ChargerIllo height={180} />
          </View>
        )}

        <View style={{ marginTop: 14 }}>
          <Row between>
            <H1 style={{ fontSize: 22 }}>{ch.title}</H1>
            <TierBadge tier={tierForCharger(ch.hardwareTier)} />
          </Row>
          <Row gap={10} style={{ marginTop: 8 }}>
            <Avatar name={ch.host.fullName} size="sm" />
            <Body>Hosted by {ch.host.fullName.split(' ')[0]}</Body>
            <HostRatingInline hostId={ch.host.id} />
          </Row>
          {distanceLabel ? (
            <Body style={{ marginTop: 6, color: c.muted }}>{distanceLabel}</Body>
          ) : null}
        </View>

        <Row gap={6} style={{ marginTop: 12, flexWrap: 'wrap' }}>
          <Chip label={ch.connectorType.toUpperCase()} />
          <Chip label={`${ch.powerKw} kW`} />
          {ch.status === 'available' ? (
            <Chip label="Available now" variant="green" iconLeft={<StatusDot />} />
          ) : (
            <Chip label={ch.status} variant="outline" />
          )}
        </Row>

        <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
          <H1 style={{ fontSize: 32 }}>{priceMain}</H1>
          <Muted>{priceUnit}</Muted>
        </View>

        {ch.houseRules ? (
          <>
            <SectionHeader>House rules</SectionHeader>
            <Body>{ch.houseRules}</Body>
          </>
        ) : null}

        <SectionHeader>Recent reviews</SectionHeader>
        {ch.hostReviews.length === 0 ? (
          <Muted>No reviews yet — be the first.</Muted>
        ) : (
          <View style={{ gap: 10 }}>
            {ch.hostReviews.map(
              (r: { id: string; stars: number; text: string | null }) => (
                <FrameSoft key={r.id}>
                  <Row gap={4} style={{ marginBottom: 4 }}>
                    {Array.from({ length: r.stars }).map((_, i) => (
                      <Star key={i} size={11} />
                    ))}
                  </Row>
                  <Body>{r.text ?? ''}</Body>
                </FrameSoft>
              ),
            )}
          </View>
        )}
      </ScrollView>
      <CTABar>
        <Button
          label="Request booking"
          iconLeft={<Bolt size={16} color={c.bg} />}
          onPress={() =>
            router.push({ pathname: '/(driver)/request/[chargerId]', params: { chargerId: ch.id } })
          }
        />
      </CTABar>
    </Screen>
  );
}

function tierForCharger(t: string): string {
  // tier_3_native → '3', tier_4_unmetered → '4'
  const m = /tier_(\d)/.exec(t);
  return m ? m[1]! : '?';
}

function HostRatingInline({ hostId }: { hostId: string }) {
  const summary = trpc.review.summary.useQuery({ userId: hostId });
  const count = summary.data?.count ?? 0;
  const avg = summary.data?.avg;
  if (count === 0 || typeof avg !== 'number') {
    return (
      <>
        <Muted>·</Muted>
        <Body>New host</Body>
      </>
    );
  }
  return (
    <>
      <Muted>·</Muted>
      <Star size={12} />
      <Body>{avg.toFixed(1)}</Body>
    </>
  );
}
