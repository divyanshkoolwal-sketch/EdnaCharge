/**
 * Where should the "Become a host" entry gate send the user?
 *
 * The bug: host completion was inferred only from `roles.includes('host')`.
 * In live mode that role is added lazily — only once the Stripe Connect account
 * is fully `charges_enabled && payouts_enabled` (see api auth.hostOnboardingStatus).
 * A host who finished the in-app flow but whose Connect account hadn't flipped
 * enabled yet — or whose cached session was stale — was treated as a brand-new
 * user and dumped back on the "Get started" intro, losing all their progress.
 *
 * Fix: derive the stage from richer server truth (the HostProfile the session
 * already carries) and route consistently from every entry point:
 *   - complete    → host dashboard
 *   - in_progress → resume onboarding at the next unfinished step (NOT the intro)
 *   - none        → the intro
 */

export type HostStage = 'none' | 'in_progress' | 'complete';

export type HostSessionLike =
  | {
      roles?: string[];
      hostProfile?: {
        stripeOnboardingComplete?: boolean;
      } | null;
    }
  | null
  | undefined;

export function hostStage(session: HostSessionLike): HostStage {
  const hp = session?.hostProfile;
  if (!hp) return 'none';
  // A live Connect account that's finished, or the role already granted.
  if (session?.roles?.includes('host') || hp.stripeOnboardingComplete) return 'complete';
  return 'in_progress';
}

/** The route the host entry gate should navigate to for a given session. */
export function hostEntryRoute(session: HostSessionLike): string {
  const stage = hostStage(session);
  if (stage === 'complete') return '/(host)/home';
  if (stage === 'in_progress') {
    // Resume where they left off instead of restarting at the intro. Identity
    // is done (the HostProfile exists); the only remaining setup step is Stripe
    // Connect (payouts). Charger qualification/listing happens separately.
    return '/(host)/host-onboarding/stripe-connect';
  }
  return '/(host)/host-onboarding/intro';
}
