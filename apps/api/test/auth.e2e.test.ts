/**
 * Auth e2e — bootstraps a user, drives driver profile, host identity, and
 * charger identification through all 4 hardware-tier outcomes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@edna/db';
import {
  HAS_SUPABASE,
  HAS_SERVICE_ROLE,
  skipReason,
  trpc,
  createSupabaseUser,
  signIn,
  uniqueEmail,
  deleteUserByEmail,
} from './helpers.js';

const skip = skipReason([
  ['SUPABASE_URL+ANON_KEY', HAS_SUPABASE],
  ['SUPABASE_SERVICE_ROLE_KEY', HAS_SERVICE_ROLE],
]);
const d = skip ? describe.skip : describe;

d(`auth router ${skip ?? ''}`, () => {
  const email = uniqueEmail('auth');
  const password = 'Test-Pass-123!';
  let token = '';
  let userId = '';

  beforeAll(async () => {
    userId = await createSupabaseUser(email, password);
    token = await signIn(email, password);
  });

  it('getSession bootstraps a User row on first call', async () => {
    const session = (await trpc('auth.getSession', token, undefined, 'query')) as {
      id: string;
      email: string;
      roles: string[];
    };
    expect(session.id).toBe(userId);
    expect(session.email).toBe(email);
    expect(session.roles).toContain('driver');
  });

  it('completeDriverProfile persists vehicle info', async () => {
    await trpc('auth.completeDriverProfile', token, {
      fullName: 'E2E Driver',
      vehicleMake: 'Tesla',
      vehicleModel: 'Model 3',
      vehicleYear: 2024,
      connectorType: 'nacs',
    });
    const dp = await prisma.driverProfile.findUniqueOrThrow({ where: { userId } });
    expect(dp.vehicleMake).toBe('Tesla');
    expect(dp.connectorType).toBe('nacs');
  });

  it('submitHostIdentity + all 4 charger-tier outcomes persist', async () => {
    await trpc('auth.submitHostIdentity', token, {
      legalName: 'E2E Host',
      dob: '1990-01-01T00:00:00.000Z',
      addressLine1: '1 Test Way',
      city: 'Pleasanton',
      state: 'CA',
      postalCode: '94566',
      country: 'US',
    });

    const tiers = [
      'tier_1_smart_plug',
      'tier_2_bridge_kit',
      'tier_3_native',
      'tier_4_unmetered',
    ] as const;

    for (const tier of tiers) {
      await trpc('auth.submitChargerIdentification', token, {
        chargerLocation: 'installed_level2',
        chargerBrand: 'Wallbox',
        chargerModel: 'Pulsar Plus',
        hasWifi: true,
        connectorType: 'j1772',
        powerKw: 7.2,
        hardwareTier: tier,
      });
      const hp = await prisma.hostProfile.findUniqueOrThrow({ where: { userId } });
      const hs = hp.hardwareSetup as { hardwareTier?: string } | null;
      expect(hs?.hardwareTier).toBe(tier);
    }
  });

  afterAll(async () => {
    await deleteUserByEmail(email);
  });
});
