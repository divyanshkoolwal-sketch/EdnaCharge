/**
 * RLS-under-JWT test. Verifies that when a user's JWT is the connection
 * credential (the postgrest/Supabase path used by mobile Realtime), a
 * non-party user sees ZERO rows for bookings / chat / sessions they don't
 * participate in.
 *
 * We talk to Supabase's REST (PostgREST) endpoint directly via fetch — that
 * keeps @edna/db free of the supabase-js dependency while exercising the
 * exact RLS path the mobile app uses.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../../src/index.js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const HAS_ALL = !!SUPABASE_URL && !!SUPABASE_ANON_KEY && !!SUPABASE_SERVICE_ROLE_KEY;
const d = HAS_ALL ? describe : describe.skip;

type AdminUserResponse = { id: string };

async function createUser(email: string, password: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!res.ok) throw new Error(`createUser failed: ${res.status} ${await res.text()}`);
  const u = (await res.json()) as AdminUserResponse;
  return u.id;
}

async function signIn(email: string, password: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`signIn failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { access_token: string };
  return body.access_token;
}

async function restSelect(table: string, token: string, query = ''): Promise<unknown[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*${query}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error(`rest ${table} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as unknown[];
}

d('RLS under user JWT', () => {
  const ts = Date.now();
  const driverEmail = `rls-drv-${ts}@test.local`;
  const hostEmail = `rls-host-${ts}@test.local`;
  const outsiderEmail = `rls-out-${ts}@test.local`;
  const pass = 'Test-Pass-123!';
  let driverToken = '';
  let hostToken = '';
  let outsiderToken = '';
  let bookingId = '';
  let threadId = '';
  let sessionId = '';

  beforeAll(async () => {
    const driverId = await createUser(driverEmail, pass);
    const hostId = await createUser(hostEmail, pass);
    await createUser(outsiderEmail, pass);
    driverToken = await signIn(driverEmail, pass);
    hostToken = await signIn(hostEmail, pass);
    outsiderToken = await signIn(outsiderEmail, pass);

    await prisma.user.create({
      data: { id: driverId, email: driverEmail, fullName: 'd', roles: ['driver'] },
    });
    await prisma.user.create({
      data: { id: hostId, email: hostEmail, fullName: 'h', roles: ['driver', 'host'] },
    });
    const charger = await prisma.charger.create({
      data: {
        hostId,
        title: 'RLS charger',
        addressLine1: '1 a',
        city: 'p',
        state: 'CA',
        postalCode: '94566',
        lat: 37.66,
        lng: -121.87,
        connectorType: 'j1772',
        powerKw: 7.2,
        hardwareTier: 'tier_1_smart_plug',
        pricePerKwhCents: 28,
        published: true,
      },
    });
    const booking = await prisma.booking.create({
      data: {
        chargerId: charger.id,
        driverId,
        startAt: new Date(Date.now() + 60_000),
        endAt: new Date(Date.now() + 3_600_000),
        estimatedKwh: 7.2,
        estimatedCostCents: 202,
        platformFeeCents: 30,
        preauthAmountCents: 232,
        autoDeclineAt: new Date(Date.now() + 30 * 60_000),
      },
    });
    bookingId = booking.id;
    const thread = await prisma.chatThread.create({ data: { bookingId: booking.id } });
    threadId = thread.id;
    await prisma.chatMessage.create({
      data: { threadId: thread.id, senderId: driverId, kind: 'text', body: 'secret' },
    });
    const session = await prisma.chargingSession.create({
      data: {
        bookingId: booking.id,
        chargerId: charger.id,
        startedAt: new Date(),
        meterStartWh: 0,
      },
    });
    sessionId = session.id;
  });

  it('driver can read own booking, outsider cannot', async () => {
    const dRows = (await restSelect('Booking', driverToken, `&id=eq.${bookingId}`)) as unknown[];
    expect(dRows.length).toBe(1);
    const oRows = (await restSelect('Booking', outsiderToken, `&id=eq.${bookingId}`)) as unknown[];
    expect(oRows.length).toBe(0);
  });

  it('host can read booking via charger; outsider cannot', async () => {
    const hRows = (await restSelect('Booking', hostToken, `&id=eq.${bookingId}`)) as unknown[];
    expect(hRows.length).toBe(1);
  });

  it('outsider sees zero chat messages', async () => {
    const rows = (await restSelect('ChatMessage', outsiderToken, `&threadId=eq.${threadId}`)) as unknown[];
    expect(rows.length).toBe(0);
  });

  it('outsider sees zero charging sessions', async () => {
    const rows = (await restSelect(
      'ChargingSession',
      outsiderToken,
      `&id=eq.${sessionId}`,
    )) as unknown[];
    expect(rows.length).toBe(0);
  });
});
