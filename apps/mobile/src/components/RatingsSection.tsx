/** @file apps/mobile/src/components/RatingsSection.tsx. */
import { Alert, Pressable, View } from 'react-native';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../../../api/src/router';
import { Card, Row, Body, Muted, SectionHeader, Avatar } from './ui';
import { Star } from './icons/Icon';
import { trpc } from '../lib/trpc';
import { handleError } from '../lib/errors';

type ReviewRow = inferRouterOutputs<AppRouter>['review']['forUser']['rows'][number];

function Stars({ n }: { n: number }) {
  return (
    <Row gap={2}>
      {Array.from({ length: Math.max(0, Math.min(5, n)) }).map((_, i) => (
        <Star key={i} size={12} />
      ))}
    </Row>
  );
}

/**
 * "Your ratings" — the caller's average rating + the individual reviews they've
 * received. Shared by the driver and host profile screens. Reuses review.summary
 * (aggregate) and review.forUser (list, includes the author).
 */
export function RatingsSection({ userId }: { userId?: string }) {
  const safeUserId = userId ?? '';
  const summary = trpc.review.summary.useQuery({ userId: safeUserId }, { enabled: !!safeUserId });
  const list = trpc.review.forUser.useQuery({ userId: safeUserId }, { enabled: !!safeUserId });
  const reportReview = trpc.moderation.reportReview.useMutation({
    onSuccess: () => Alert.alert('Report sent', 'Thanks. We’ll review this rating.'),
    onError: (e) => handleError(e, { feature: 'Safety' }),
  });
  const count = summary.data?.count ?? 0;
  const avg = summary.data?.avg;
  const rows = list.data?.rows ?? [];

  return (
    <>
      <SectionHeader>Your ratings</SectionHeader>
      <Card padding={14}>
        {summary.isError || list.isError ? (
          <Muted style={{ fontSize: 13 }}>Couldn’t load your ratings. Pull to refresh.</Muted>
        ) : count > 0 && typeof avg === 'number' ? (
          <Row gap={8} style={{ alignItems: 'center' }}>
            <Star size={16} />
            <Body style={{ fontWeight: '800', fontSize: 20 }}>{avg.toFixed(1)}</Body>
            <Muted>
              · {count} rating{count === 1 ? '' : 's'}
            </Muted>
          </Row>
        ) : (
          <Muted style={{ fontSize: 13 }}>
            No ratings yet. Complete a session to get your first review.
          </Muted>
        )}
      </Card>

      {rows.map((r: ReviewRow) => (
        <Card key={r.id} padding={12} style={{ marginTop: 8 }}>
          <Row gap={10}>
            <Avatar name={r.author?.fullName ?? 'EC'} uri={r.author?.avatarUrl} size="sm" />
            <View style={{ flex: 1 }}>
              <Row between style={{ alignItems: 'center' }}>
                <Body style={{ fontWeight: '600', fontSize: 13, flex: 1 }}>
                  {r.author?.fullName ?? 'User'}
                </Body>
                <Stars n={r.stars} />
              </Row>
              {r.text ? (
                <Muted style={{ fontSize: 13, marginTop: 4, lineHeight: 19 }}>{r.text}</Muted>
              ) : null}
              <Pressable
                onPress={() =>
                  Alert.alert(
                    'Report this review?',
                    'Our team will review it for policy violations. This cannot be undone.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Report',
                        style: 'destructive',
                        onPress: () => reportReview.mutate({ reviewId: r.id, reason: 'other' }),
                      },
                    ],
                  )
                }
                disabled={reportReview.isPending}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Report review"
                style={{ alignSelf: 'flex-start', marginTop: 8 }}
              >
                <Muted style={{ fontSize: 12 }}>Report</Muted>
              </Pressable>
            </View>
          </Row>
        </Card>
      ))}
    </>
  );
}
