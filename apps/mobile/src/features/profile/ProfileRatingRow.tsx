/** @file apps/mobile/src/features/profile/ProfileRatingRow.tsx. */
import { Star } from '../../components/icons/Icon';
import { Muted, Row } from '../../components/ui';
import { trpc } from '../../lib/trpc';

type ProfileRole = 'driver' | 'host';

type ProfileRatingUser = {
  id: string;
  email?: string | null;
  createdAt?: Date | string | null;
};

export function ProfileRatingRow({
  role,
  me,
}: {
  role: ProfileRole;
  me: ProfileRatingUser | null | undefined;
}) {
  const userId = me?.id ?? '';
  const summary = trpc.review.summary.useQuery({ userId }, { enabled: !!userId });
  const count = summary.data?.count ?? 0;
  const avg = summary.data?.avg;

  if (role === 'driver') {
    const displayEmail = me?.email?.endsWith('@ednacharge.local') ? null : me?.email;
    return (
      <Row gap={4}>
        {count > 0 && typeof avg === 'number' ? (
          <>
            <Star size={11} />
            <Muted>{displayEmail ? `${avg.toFixed(1)} · ${displayEmail}` : avg.toFixed(1)}</Muted>
          </>
        ) : (
          <Muted>{displayEmail ?? ''}</Muted>
        )}
      </Row>
    );
  }

  const since = me?.createdAt
    ? new Date(me.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
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
