/** @file apps/mobile/app/index.tsx. */
import { Redirect } from 'expo-router';
import { ActivityIndicator } from 'react-native';
import { Screen, ErrorState } from '../src/components/ui';
import { authRouteForSession } from '../src/lib/authRouting';
import { trpc } from '../src/lib/trpc';
import { useAuth } from '../src/state/auth';
import { useRole } from '../src/state/role';

export default function Index() {
  const { session, loading } = useAuth();
  const role = useRole((s) => s.role);
  const me = trpc.auth.getSession.useQuery(undefined, { enabled: !!session });

  if (loading || (session && me.isLoading)) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </Screen>
    );
  }
  if (!session) return <Redirect href="/(auth)/welcome" />;
  // A transient getSession failure must NOT bounce a fully-onboarded, signed-in
  // user to the waitlist/access-gate — offer a retry instead. Only route to the
  // access-gate when the session genuinely loaded with no access data.
  if (me.isError) {
    return (
      <Screen style={{ justifyContent: 'center' }}>
        <ErrorState onRetry={() => me.refetch()} />
      </Screen>
    );
  }
  if (!me.data) return <Redirect href="/(auth)/access-gate" />;
  return <Redirect href={authRouteForSession(me.data, role) as never} />;
}
