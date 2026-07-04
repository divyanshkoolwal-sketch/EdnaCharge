/** App-access invite and waitlist e2e tests. */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { prisma } from '@edna/db';
import { hashInviteCode } from '../src/lib/access.js';
import {
  HAS_SERVICE_ROLE,
  HAS_SUPABASE,
  createSupabaseUser,
  deleteUserByEmail,
  signIn,
  skipReason,
  trpc,
  uniqueEmail,
} from './helpers.js';

const skip = skipReason([
  ['SUPABASE_URL+ANON_KEY', HAS_SUPABASE],
  ['SUPABASE_SERVICE_ROLE_KEY', HAS_SERVICE_ROLE],
]);
const d = skip ? describe.skip : describe;

d(`access router ${skip ?? ''}`, () => {
  const email = uniqueEmail('access');
  const otherEmail = uniqueEmail('access-other');
  const driverEmail = uniqueEmail('access-driver');
  let token = '';
  let otherToken = '';
  let driverToken = '';
  let userId = '';
  let otherUserId = '';
  let driverUserId = '';

  beforeAll(async () => {
    userId = await createSupabaseUser(email, 'Test-Pass-123!');
    otherUserId = await createSupabaseUser(otherEmail, 'Test-Pass-123!');
    driverUserId = await createSupabaseUser(driverEmail, 'Test-Pass-123!');
    token = await signIn(email, 'Test-Pass-123!');
    otherToken = await signIn(otherEmail, 'Test-Pass-123!');
    driverToken = await signIn(driverEmail, 'Test-Pass-123!');
  });

  it('allows session and waitlist without a grant, but blocks discovery', async () => {
    const session = (await trpc('auth.getSession', token, undefined, 'query')) as {
      accessGrants: unknown[];
    };
    expect(session.accessGrants).toHaveLength(0);

    await trpc('access.joinWaitlist', token, {
      role: 'host',
      city: 'Fremont',
      postalCode: '94538',
      chargerBrand: 'Wallbox',
      hasOcpp: true,
    });
    await trpc('access.joinWaitlist', token, {
      role: 'host',
      city: 'Fremont',
      postalCode: '94539',
    });
    const rows = await prisma.appWaitlistEntry.findMany({ where: { userId, role: 'host' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.postalCode).toBe('94539');

    await expect(
      trpc(
        'charger.nearby',
        token,
        { lat: 37.5485, lng: -121.9886, radiusMeters: 10_000, filters: {} },
        'query',
      ),
    ).rejects.toThrow(/FORBIDDEN/);
    await expect(
      trpc('auth.startIdentityVerification', token, undefined),
    ).rejects.toThrow(/FORBIDDEN/);
  });

  it('redeems a host code for host-only access', async () => {
    const code = `HOST-FREMONT-${Date.now()}`;
    await prisma.inviteCode.create({
      data: { codeHash: hashInviteCode(code), role: 'host', campaign: 'test' },
    });
    await trpc('access.redeemCode', token, { role: 'host', code });
    await trpc('auth.submitHostIdentity', token, {
      legalName: 'Access Host',
      dob: '1990-01-01T00:00:00.000Z',
      addressLine1: '1 Fremont St',
      city: 'Fremont',
      state: 'CA',
      postalCode: '94538',
      country: 'US',
    });
    await expect(
      trpc(
        'charger.nearby',
        token,
        { lat: 37.5485, lng: -121.9886, radiusMeters: 10_000, filters: {} },
        'query',
      ),
    ).rejects.toThrow(/FORBIDDEN/);
  });

  it('redeems a driver code for driver-only access', async () => {
    const code = `DRIVER-FREMONT-${Date.now()}`;
    await prisma.inviteCode.create({
      data: { codeHash: hashInviteCode(code), role: 'driver', campaign: 'test' },
    });
    await trpc('access.redeemCode', driverToken, { role: 'driver', code });
    await trpc('auth.completeDriverProfile', driverToken, {
      fullName: 'Access Driver',
      vehicleMake: 'Tesla',
      vehicleModel: 'Model 3',
      vehicleYear: 2024,
      connectorType: 'nacs',
    });
    await expect(
      trpc('auth.submitHostIdentity', driverToken, {
        legalName: 'Access Host Blocked',
        dob: '1990-01-01T00:00:00.000Z',
        addressLine1: '1 Fremont St',
        city: 'Fremont',
        state: 'CA',
        postalCode: '94538',
        country: 'US',
      }),
    ).rejects.toThrow(/FORBIDDEN/);
  });

  it('rejects wrong-role, expired, disabled, and already-used codes', async () => {
    const used = `DRIVER-FREMONT-${Date.now()}`;
    await prisma.inviteCode.create({
      data: { codeHash: hashInviteCode(used), role: 'driver', campaign: 'test' },
    });
    await trpc('access.redeemCode', otherToken, { role: 'driver', code: used });
    await expect(trpc('access.redeemCode', token, { role: 'driver', code: used })).rejects.toThrow(
      /not valid/,
    );
    await expect(trpc('access.redeemCode', token, { role: 'host', code: used })).rejects.toThrow(
      /not valid/,
    );

    for (const [suffix, data] of [
      ['EXPIRED', { expiresAt: new Date(Date.now() - 60_000) }],
      ['DISABLED', { disabledAt: new Date() }],
    ] as const) {
      const code = `HOST-${suffix}-${Date.now()}`;
      await prisma.inviteCode.create({
        data: { codeHash: hashInviteCode(code), role: 'host', campaign: 'test', ...data },
      });
      await expect(trpc('access.redeemCode', token, { role: 'host', code })).rejects.toThrow(
        /not valid/,
      );
    }
  });

  afterAll(async () => {
    await deleteUserByEmail(email);
    await deleteUserByEmail(otherEmail);
    await deleteUserByEmail(driverEmail);
    await prisma.inviteCode.deleteMany({ where: { campaign: 'test' } });
    void otherUserId;
    void driverUserId;
  });
});
