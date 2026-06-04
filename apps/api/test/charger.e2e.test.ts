/**
 * Charger e2e — create enforces host role, nearby clusters within radius,
 * ocppCredentials rotates the bcrypt hash.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
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

d(`charger router ${skip ?? ''}`, () => {
  const driverEmail = uniqueEmail('drv');
  const hostEmail = uniqueEmail('host');
  const password = 'Test-Pass-123!';
  let driverToken = '';
  let hostToken = '';
  let hostId = '';
  let chargerId = '';

  beforeAll(async () => {
    await createSupabaseUser(driverEmail, password);
    hostId = await createSupabaseUser(hostEmail, password);
    driverToken = await signIn(driverEmail, password);
    hostToken = await signIn(hostEmail, password);
    await trpc('auth.getSession', driverToken, undefined, 'query');
    await trpc('auth.getSession', hostToken, undefined, 'query');
    // Promote host.
    await prisma.user.update({ where: { id: hostId }, data: { roles: { set: ['driver', 'host'] } } });
  });

  afterAll(async () => {
    await deleteUserByEmail(driverEmail);
    await deleteUserByEmail(hostEmail);
  });

  it('create refuses non-host callers', async () => {
    await expect(
      trpc('charger.create', driverToken, {
        title: 'Forbidden',
        addressLine1: '1 Main',
        city: 'Pleasanton',
        state: 'CA',
        postalCode: '94566',
        country: 'US',
        lat: 37.66,
        lng: -121.87,
        connectorType: 'j1772',
        powerKw: 7.2,
        hardwareTier: 'tier_3_native',
        pricePerKwhCents: 28,
      }),
    ).rejects.toThrow();
  });

  it('create succeeds for hosts + provisions ocpp credentials for tier 3', async () => {
    const charger = (await trpc('charger.create', hostToken, {
      title: 'E2E Tier3',
      addressLine1: '500 Main',
      city: 'Pleasanton',
      state: 'CA',
      postalCode: '94566',
      country: 'US',
      lat: 37.6624,
      lng: -121.8747,
      connectorType: 'j1772',
      powerKw: 7.2,
      hardwareTier: 'tier_3_native',
      pricePerKwhCents: 28,
    })) as { id: string };
    chargerId = charger.id;
    const fresh = await prisma.charger.findUniqueOrThrow({ where: { id: chargerId } });
    expect(fresh.ocppChargePointId).toBeTruthy();
    expect(fresh.ocppAuthHash).toBeTruthy();
  });

  it('nearby returns chargers clustered within radius', async () => {
    const rows = (await trpc(
      'charger.nearby',
      hostToken,
      {
        lat: 37.6624,
        lng: -121.8747,
        radiusMeters: 5000,
        filters: { connectorType: 'j1772' },
      },
      'query',
    )) as Array<{ id: string; distanceM: number }>;
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.some((r) => r.id === chargerId)).toBe(true);
  });

  it('regenerateOcppCredentials rotates the bcrypt hash', async () => {
    const before = await prisma.charger.findUniqueOrThrow({ where: { id: chargerId } });
    const res = (await trpc('charger.regenerateOcppCredentials', hostToken, { id: chargerId })) as {
      password: string;
      chargePointId: string;
      wssUrl: string;
    };
    const after = await prisma.charger.findUniqueOrThrow({ where: { id: chargerId } });
    expect(after.ocppAuthHash).not.toBe(before.ocppAuthHash);
    expect(await bcrypt.compare(res.password, after.ocppAuthHash!)).toBe(true);
  });
});
