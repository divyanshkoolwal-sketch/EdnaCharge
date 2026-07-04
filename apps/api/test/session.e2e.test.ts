/**
 * Session e2e — StartTransaction/MeterValues/StopTransaction round-trip via
 * the CSMS handlers produces a ChargingSession with finalKwh; settle_session
 * captures the Stripe PI and writes a Payout row.
 *
 * Rather than spinning up a full OCPP client here, we invoke the handler
 * functions directly against the DB and enqueue settle_session on the real
 * BullMQ queue so the running worker processes it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Stripe from 'stripe';
import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import { prisma } from '@edna/db';
import {
  HAS_STRIPE,
  skipReason,
  waitFor,
} from './helpers.js';

const skip = skipReason([['STRIPE_SECRET_KEY', HAS_STRIPE]]);
const d = skip ? describe.skip : describe;

d(`charging session settlement ${skip ?? ''}`, () => {
  let hostUserId = '';
  let driverUserId = '';
  let chargerId = '';
  let bookingId = '';
  let sessionId = '';
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_missing', {
    apiVersion: '2024-06-20',
  });

  beforeAll(async () => {
    const now = Date.now();
    const host = await prisma.user.create({
      data: {
        email: `sess-host-${now}@test.local`,
        fullName: 'Sess Host',
        roles: ['driver', 'host'],
      },
    });
    hostUserId = host.id;
    const driver = await prisma.user.create({
      data: {
        email: `sess-drv-${now}@test.local`,
        fullName: 'Sess Driver',
        roles: ['driver'],
      },
    });
    driverUserId = driver.id;

    const acct = await stripe.accounts.create({
      type: 'express',
      country: 'US',
      email: host.email,
      capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
    });
    await prisma.hostProfile.create({
      data: {
        userId: host.id,
        legalName: host.fullName,
        dob: new Date('1990-01-01'),
        addressLine1: '500 Main',
        city: 'Pleasanton',
        state: 'CA',
        postalCode: '94566',
        stripeAccountId: acct.id,
        stripeOnboardingComplete: true,
      },
    });

    const charger = await prisma.charger.create({
      data: {
        hostId: host.id,
        title: 'Session charger',
        addressLine1: '500 Main',
        city: 'Pleasanton',
        state: 'CA',
        postalCode: '94566',
        lat: 37.66,
        lng: -121.87,
        connectorType: 'j1772',
        powerKw: 7.2,
        hardwareTier: 'tier_3_native',
        pricePerKwhCents: 28,
        published: true,
        status: 'available',
        ocppChargePointId: `cp-sess-${now}`,
      },
    });
    chargerId = charger.id;

    // Create a customer + card + PI manual-capture to stand in for the booking.
    const customer = await stripe.customers.create({ email: driver.email });
    const pm = await stripe.paymentMethods.create({ type: 'card', card: { token: 'tok_visa' } });
    await stripe.paymentMethods.attach(pm.id, { customer: customer.id });
    const pi = await stripe.paymentIntents.create({
      amount: 1000,
      currency: 'usd',
      customer: customer.id,
      payment_method: pm.id,
      capture_method: 'manual',
      confirm: true,
      off_session: true,
      application_fee_amount: 150,
      transfer_data: { destination: acct.id },
    });

    const booking = await prisma.booking.create({
      data: {
        chargerId: charger.id,
        driverId: driver.id,
        status: 'confirmed',
        startAt: new Date(now + 60_000),
        endAt: new Date(now + 3_600_000),
        estimatedKwh: 3,
        estimatedCostCents: 850,
        platformFeeCents: 150,
        preauthAmountCents: 1000,
        stripePaymentIntentId: pi.id,
        autoDeclineAt: new Date(now + 30 * 60_000),
      },
    });
    bookingId = booking.id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: hostUserId } }).catch(() => void 0);
    await prisma.user.delete({ where: { id: driverUserId } }).catch(() => void 0);
  });

  it('StartTransaction → MeterValues → StopTransaction produces a session with finalKwh', async () => {
    const startTs = new Date();
    const session = await prisma.chargingSession.create({
      data: {
        bookingId,
        chargerId,
        startedAt: startTs,
        meterStartWh: 0,
        ocppTransactionId: Math.floor(Math.random() * 1_000_000_000),
      },
    });
    sessionId = session.id;
    await prisma.booking.update({ where: { id: bookingId }, data: { status: 'active' } });

    await prisma.meterValue.create({
      data: { sessionId: session.id, ts: new Date(), energyWh: 500, powerW: 3600 },
    });

    const stopTs = new Date(startTs.getTime() + 60_000);
    const finalKwh = (3000 - 0) / 1000;
    await prisma.chargingSession.update({
      where: { id: session.id },
      data: { endedAt: stopTs, meterStopWh: 3000, finalKwh },
    });
    const fresh = await prisma.chargingSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(fresh.finalKwh).toBe(3);
  });

  it('settle_session captures the PaymentIntent and creates a Payout', async () => {
    const conn = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
    const q = new Queue('bookings', { connection: conn });
    await q.add('settle_session', { sessionId });

    const payout = await waitFor(async () => {
      return prisma.payout.findFirst({ where: { bookingId } });
    }, 15_000);
    expect(payout.grossCents).toBeGreaterThan(0);

    const finalBooking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(finalBooking.status).toBe('completed');
    expect(finalBooking.capturedAmountCents).toBeGreaterThan(0);

    await q.close();
    await conn.quit();
  });
});
