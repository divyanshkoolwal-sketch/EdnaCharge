/** @file apps/mobile/test/authRouting.unit.test.ts. */
import { describe, expect, it } from 'vitest';
import { authRouteForSession, hasRoleAccess } from '../src/lib/authRouting';

describe('authRouteForSession', () => {
  it('routes users without access grants to the access gate', () => {
    expect(authRouteForSession({ driverProfile: null, hostProfile: null, accessGrants: [] })).toBe(
      '/(auth)/access-gate',
    );
  });

  it('routes driver-granted users through driver onboarding', () => {
    expect(
      authRouteForSession({
        driverProfile: null,
        hostProfile: null,
        accessGrants: [{ role: 'driver' }],
      }),
    ).toBe('/(auth)/driver-profile');
    expect(
      authRouteForSession({
        driverProfile: {},
        hostProfile: null,
        accessGrants: [{ role: 'driver' }],
      }),
    ).toBe('/(driver)/map');
  });

  it('routes host-granted users through host onboarding', () => {
    expect(
      authRouteForSession({
        driverProfile: null,
        hostProfile: null,
        accessGrants: [{ role: 'host' }],
      }),
    ).toBe('/(host)/host-onboarding/intro');
    expect(
      authRouteForSession({
        driverProfile: null,
        hostProfile: {},
        accessGrants: [{ role: 'host' }],
      }),
    ).toBe('/(host)/home');
  });

  it('routes dual-role users by their preferred (last-selected) role, never to /', () => {
    const dualRole = {
      driverProfile: {},
      hostProfile: {},
      accessGrants: [{ role: 'driver' as const }, { role: 'host' as const }],
    };
    // Default preferred role is driver.
    expect(authRouteForSession(dualRole)).toBe('/(driver)/map');
    expect(authRouteForSession(dualRole, 'driver')).toBe('/(driver)/map');
    expect(authRouteForSession(dualRole, 'host')).toBe('/(host)/home');
  });

  it('checks role grants independently', () => {
    const session = { accessGrants: [{ role: 'host' as const }] };
    expect(hasRoleAccess(session, 'host')).toBe(true);
    expect(hasRoleAccess(session, 'driver')).toBe(false);
  });
});
