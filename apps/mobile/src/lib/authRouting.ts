/** Shared post-auth destination logic for mobile auth screens. */

export type AuthRouteSession = {
  driverProfile?: unknown | null;
  hostProfile?: unknown | null;
  accessGrants?: Array<{ role: 'driver' | 'host' }> | null;
};

type RouterLike = {
  replace: (href: never) => void;
};

export function authRouteForSession(
  session: AuthRouteSession,
  // For a user who has completed BOTH driver and host profiles, route by the
  // last-selected role. Defaults to 'driver' (matching the role store default).
  preferredRole: 'driver' | 'host' = 'driver',
): string {
  const canDriver = hasRoleAccess(session, 'driver');
  const canHost = hasRoleAccess(session, 'host');
  if (!canDriver && !canHost) return '/(auth)/access-gate';
  if (canDriver && !canHost) {
    return session.driverProfile ? '/(driver)/map' : '/(auth)/driver-profile';
  }
  if (canHost && !canDriver) {
    return session.hostProfile ? '/(host)/home' : '/(host)/host-onboarding/intro';
  }
  if (!session.driverProfile && !session.hostProfile) return '/(auth)/pick-role';
  if (session.driverProfile && !session.hostProfile) return '/(driver)/map';
  if (session.hostProfile && !session.driverProfile) return '/(host)/home';
  // Both profiles complete: honor the preferred role. Never return '/', which is
  // index.tsx itself and would redirect to itself forever (blank-screen dead-end).
  return preferredRole === 'host' ? '/(host)/home' : '/(driver)/map';
}

export function hasRoleAccess(
  session: AuthRouteSession | null | undefined,
  role: 'driver' | 'host',
): boolean {
  return session?.accessGrants?.some((grant) => grant.role === role) ?? false;
}

export function routeAfterAuthSession(
  router: RouterLike,
  session: AuthRouteSession,
  preferredRole: 'driver' | 'host' = 'driver',
): void {
  router.replace(authRouteForSession(session, preferredRole) as never);
}
