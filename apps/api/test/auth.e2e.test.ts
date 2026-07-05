/**
 * Auth e2e — bootstraps a user, drives driver profile, host identity, and
 * host identity.
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
  grantAccess,
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
    await grantAccess(userId, 'driver');
    await grantAccess(userId, 'host');
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

  it('submitHostIdentity persists host profile data', async () => {
    await trpc('auth.submitHostIdentity', token, {
      legalName: 'E2E Host',
      dob: '1990-01-01T00:00:00.000Z',
      addressLine1: '1 Test Way',
      city: 'Pleasanton',
      state: 'CA',
      postalCode: '94566',
      country: 'US',
    });
    const hp = await prisma.hostProfile.findUniqueOrThrow({ where: { userId } });
    expect(hp.legalName).toBe('E2E Host');
    expect(hp.city).toBe('Pleasanton');
  });

  afterAll(async () => {
    await deleteUserByEmail(email);
  });
});
