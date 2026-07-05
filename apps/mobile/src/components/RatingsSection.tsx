import { View } from 'react-native';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../../../api/src/router';
import { Card, Row, Body, Muted, SectionHeader, Avatar } from './ui';
import { Star } from './icons/Icon';
import { trpc } from '../lib/trpc';

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
  const summary = trpc.review.summary.useQuery({ userId: userId! }, { enabled: !!userId });
  const list = trpc.review.forUser.useQuery({ userId: userId! }, { enabled: !!userId });
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
            </View>
          </Row>
        </Card>
      ))}
    </>
  );
}
