import type { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { stripe } from '../lib/stripe.js';
import { prisma } from '@edna/db';
import { logger } from '../logger.js';

export async function registerStripeWebhooks(app: FastifyInstance) {
  // Fastify needs raw body for Stripe signature verification.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_req, body, done) => done(null, body),
  );

  app.post('/webhooks/stripe', async (req, reply) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      logger.error('STRIPE_WEBHOOK_SECRET not set');
      return reply.code(500).send({ error: 'webhook secret missing' });
    }
    const sig = req.headers['stripe-signature'];
    let event: Stripe.Event;
    try {
      event = stripe().webhooks.constructEvent(
        req.body as Buffer,
        Array.isArray(sig) ? (sig[0] ?? '') : sig ?? '',
        secret,
      );
    } catch (err) {
      logger.warn({ err }, 'stripe signature verification failed');
      return reply.code(400).send({ error: 'bad signature' });
    }

    switch (event.type) {
      case 'account.updated': {
        const account = event.data.object;
        const profile = await prisma.hostProfile.findFirst({
          where: { stripeAccountId: account.id },
        });
        if (profile) {
          const complete =
            !!account.details_submitted && !!account.charges_enabled && !!account.payouts_enabled;
          await prisma.hostProfile.update({
            where: { userId: profile.userId },
            data: { stripeOnboardingComplete: complete },
          });
          if (complete) {
            await prisma.user.update({
              where: { id: profile.userId },
              data: { roles: { set: ['driver', 'host'] } },
            });
          }
        }
        break;
      }
      case 'payment_intent.canceled':
      case 'payment_intent.succeeded':
      case 'payment_intent.amount_capturable_updated': {
        const pi = event.data.object;
        const booking = await prisma.booking.findUnique({
          where: { stripePaymentIntentId: pi.id },
        });
        if (!booking) break;
        if (pi.status === 'succeeded' && pi.amount_received > 0) {
          await prisma.booking.update({
            where: { id: booking.id },
            data: { capturedAmountCents: pi.amount_received },
          });
        }
        break;
      }
      default:
        logger.debug({ type: event.type }, 'stripe event unhandled');
    }
    return { received: true };
  });
}
