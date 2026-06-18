/**
 * Regression test for bug #4: a host who finished onboarding (or is mid-way)
 * must never be routed back to the fresh "Get started" intro.
 */
import { describe, it, expect } from 'vitest';
import { hostStage, hostEntryRoute } from '../src/lib/hostEntry';

describe('hostStage — server-derived host completion', () => {
  it('none when there is no HostProfile', () => {
    expect(hostStage({ roles: ['driver'], hostProfile: null })).toBe('none');
    expect(hostStage(undefined)).toBe('none');
  });

  it('complete when the host role is granted', () => {
    expect(hostStage({ roles: ['driver', 'host'], hostProfile: { stripeOnboardingComplete: false } })).toBe(
      'complete',
    );
  });

  it('complete when Stripe onboarding finished even if the role lags', () => {
    // The exact bug: role not yet flipped, but the host genuinely finished.
    expect(hostStage({ roles: ['driver'], hostProfile: { stripeOnboardingComplete: true } })).toBe(
      'complete',
    );
  });

  it('in_progress when a HostProfile exists but onboarding is unfinished', () => {
    expect(hostStage({ roles: ['driver'], hostProfile: { stripeOnboardingComplete: false } })).toBe(
      'in_progress',
    );
  });
});

describe('hostEntryRoute — never the intro once started', () => {
  it('routes a completed host to the dashboard', () => {
    expect(hostEntryRoute({ roles: ['driver', 'host'], hostProfile: {} })).toBe('/(host)/home');
  });

  it('resumes an in-progress host at Stripe Connect (charger step already done)', () => {
    expect(
      hostEntryRoute({ roles: ['driver'], hostProfile: { hardwareSetup: { tier: 'tier_3_native' } } }),
    ).toBe('/(host)/host-onboarding/stripe-connect');
  });

  it('resumes an in-progress host at charger identification (no hardware yet)', () => {
    expect(hostEntryRoute({ roles: ['driver'], hostProfile: { hardwareSetup: null } })).toBe(
      '/(host)/host-onboarding/charger-identification',
    );
  });

  it('sends a brand-new user to the intro', () => {
    expect(hostEntryRoute({ roles: ['driver'], hostProfile: null })).toBe(
      '/(host)/host-onboarding/intro',
    );
  });
});
