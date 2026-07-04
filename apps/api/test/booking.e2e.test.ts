/**
 * Booking lifecycle e2e — requestBooking creates Booking + ChatThread +
 * PaymentIntent + auto-decline job; respond flips status; auto-decline kicks
 * in when AUTO_DECLINE_MS=2000 override is active.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Stripe from 'stripe';
import { prisma } from '@edna/db';
import {
  HAS_SUPABASE,
  HAS_SERVICE_ROLE,
  HAS_STRIPE,
  skipReason,
  trpc,
  createSupabaseUser,
  signIn,
  uniqueEmail,
  deleteUserByEmail,
  waitFor,
  grantAccess,
} from './helpers.js';

const skip = skipReason([
  ['SUPABASE_URL+ANON_KEY', HAS_SUPABASE],
  ['SUPABASE_SERVICE_ROLE_KEY', HAS_SERVICE_ROLE],
  ['STRIPE_SECRET_KEY', HAS_STRIPE],
]);
const d = skip ? describe.skip : describe;

d(`booking lifecycle ${skip ?? ''}`, () => {
  const driverEmail = uniqueEmail('drv');
  const hostEmail = uniqueEmail('host');
  const password = 'Test-Pass-123!';
  let driverToken = '';
  let hostToken = '';
  let driverId = '';
  let hostId = '';
  let chargerId = '';
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_missing', {
    apiVersion: '2024-06-20',
  });

  beforeAll(async () => {
    driverId = await createSupabaseUser(driverEmail, password);
    hostId = await createSupabaseUser(hostEmail, password);
    driverToken = await signIn(driverEmail, password);
    hostToken = await signIn(hostEmail, password);
    await grantAccess(driverId, 'driver');
    await grantAccess(hostId, 'host');
    await trpc('auth.getSession', driverToken, undefined, 'query');
    await trpc('auth.getSession', hostToken, undefined, 'query');

    // Driver: ensure a Stripe customer + attached card + default pm.
    await trpc('payment.setupIntent', driverToken, undefined);
    const driver = await prisma.user.findUniqueOrThrow({ where: { id: driverId } });
    await prisma.identityVerification.upsert({
      where: { userId: driverId },
      create: { userId: driverId, status: 'verified', verifiedAt: new Date() },
      update: { status: 'verified', verifiedAt: new Date() },
    });
    const pm = await stripe.paymentMethods.create({ type: 'card', card: { token: 'tok_visa' } });
    await stripe.paymentMethods.attach(pm.id, { customer: driver.stripeCustomerId! });
    await trpc('payment.setDefault', driverToken, { paymentMethodId: pm.id });

    // Host: pretend Stripe Connect is onboarded — insert a test account id directly.
    await prisma.user.update({ where: { id: hostId }, data: { roles: { set: ['driver', 'host'] } } });
    await prisma.identityVerification.upsert({
      where: { userId: hostId },
      create: { userId: hostId, status: 'verified', verifiedAt: new Date() },
      update: { status: 'verified', verifiedAt: new Date() },
    });
    const acct = await stripe.accounts.create({
      type: 'express',
      country: 'US',
      email: hostEmail,
      capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
    });
    await prisma.hostProfile.create({
      data: {
        userId: hostId,
        legalName: 'E2E Host',
        dob: new Date('1990-01-01'),
        addressLine1: '500 Main',
        city: 'Pleasanton',
        state: 'CA',
        postalCode: '94566',
        country: 'US',
        stripeAccountId: acct.id,
        stripeOnboardingComplete: true,
      },
    });

    // Host: create charger.
    const c = (await trpc('charger.create', hostToken, {
      title: 'E2E Booking Charger',
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
    })) as { id: string };
    chargerId = c.id;
  });

  afterAll(async () => {
    await deleteUserByEmail(driverEmail);
    await deleteUserByEmail(hostEmail);
  });

  it('requestBooking creates Booking + ChatThread + PaymentIntent', async () => {
    const startAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const endAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const res = (await trpc('booking.requestBooking', driverToken, {
      chargerId,
      startAt,
      endAt,
      message: 'hi',
    })) as { booking: { id: string; stripePaymentIntentId: string; status: string }; thread: { id: string } };
    expect(res.booking.status).toBe('pending');
    expect(res.booking.stripePaymentIntentId).toMatch(/^pi_/);
    expect(res.thread.id).toBeTruthy();

    const thread = await prisma.chatThread.findUniqueOrThrow({
      where: { bookingId: res.booking.id },
      include: { messages: true },
    });
    expect(thread.messages.some((m) => m.kind === 'system')).toBe(true);
  });

  it('respond=accept flips status + posts a system message', async () => {
    const b = await prisma.booking.findFirstOrThrow({
      where: { chargerId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });
    await trpc('booking.respond', hostToken, { bookingId: b.id, decision: 'accept' });
    const fresh = await prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
    expect(fresh.status).toBe('confirmed');
    const sys = await prisma.chatMessage.findMany({
      where: { thread: { bookingId: b.id }, kind: 'system' },
    });
    expect(sys.some((m) => m.body.toLowerCase().includes('confirmed'))).toBe(true);
  });

  it('respond=decline cancels the PaymentIntent', async () => {
    const startAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
    const endAt = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();
    const res = (await trpc('booking.requestBooking', driverToken, {
      chargerId,
      startAt,
      endAt,
    })) as { booking: { id: string; stripePaymentIntentId: string } };
    await trpc('booking.respond', hostToken, {
      bookingId: res.booking.id,
      decision: 'decline',
      reason: 'busy',
    });
    const pi = await stripe.paymentIntents.retrieve(res.booking.stripePaymentIntentId);
    expect(pi.status).toBe('canceled');
  });

  it('auto-decline under AUTO_DECLINE_MS=2000 flips pending → declined', async () => {
    // Relies on the worker having been started with AUTO_DECLINE_MS=2000 in its env.
    // Flag to skip if the override isn't active.
    if (process.env.AUTO_DECLINE_MS !== '2000') {
      console.warn('[SKIP auto-decline] AUTO_DECLINE_MS not set to 2000');
      return;
    }
    const startAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
    const endAt = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString();
    const res = (await trpc('booking.requestBooking', driverToken, {
      chargerId,
      startAt,
      endAt,
    })) as { booking: { id: string } };
    const declined = await waitFor(async () => {
      const b = await prisma.booking.findUnique({ where: { id: res.booking.id } });
      return b && b.status === 'declined' ? b : null;
    }, 10_000);
    expect(declined.status).toBe('declined');
    expect(declined.declineReason).toBe('auto_timeout');
  });
});
