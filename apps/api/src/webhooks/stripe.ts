import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import Stripe from 'stripe';
import { stripe } from '../lib/stripe.js';
import { prisma } from '@edna/db';
import { logger } from '../logger.js';
import { Sentry } from '../sentry.js';

// AUDIT C2: Encapsulate the Stripe webhook in its own plugin so the raw-body
// content-type parser is scoped to this plugin's routes only. If installed at
// the root app, it shadows JSON parsing for tRPC and every other route.
export async function registerStripeWebhooks(app: FastifyInstance) {
  // Registering without `fastify-plugin` preserves encapsulation — the
  // content-type parser added inside this plugin stays local to this subtree.
  await app.register(stripeWebhookPlugin);
}

const stripeWebhookPlugin: FastifyPluginAsync = async (scoped) => {
  // Scoped to this plugin only — does NOT leak to sibling routes (tRPC etc).
  scoped.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_req, body, done) => done(null, body),
  );

  scoped.post('/webhooks/stripe', async (req, reply) => {
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

    // AUDIT H8 + race fix: de-duplicate Stripe event deliveries with a
    // race-safe upsert pattern. Two concurrent identical deliveries could
    // both pass a `create()` + catch-unique check before either commits.
    // The upsert + `processedAt IS NULL` guard makes that impossible:
    // whoever wins the race processes the event and stamps `processedAt`,
    // the other observes the stamp and bails.
    const dedup = await prisma.stripeWebhookEvent.upsert({
      where: { id: event.id },
      create: { id: event.id, type: event.type },
      update: {},
    });
    if (dedup.processedAt !== null) {
      logger.info({ eventId: event.id, type: event.type }, 'stripe event already processed');
      return { received: true, duplicate: true };
    }

    try {
      switch (event.type) {
        case 'account.updated': {
          const evtAccount = event.data.object;
          const profile = await prisma.hostProfile.findFirst({
            where: { stripeAccountId: evtAccount.id },
          });
          if (profile) {
            // AUDIT M9: re-fetch the account rather than trusting the (possibly
            // stale/replayed) event payload for sensitive role elevation.
            const account = await stripe().accounts.retrieve(evtAccount.id);
            const complete =
              !!account.details_submitted &&
              !!account.charges_enabled &&
              !!account.payouts_enabled;
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
        case 'payment_intent.canceled': {
          // AUDIT H7: reconcile out-of-band PI cancellations (e.g. radar post-auth
          // declines). Without this, the booking stays `pending` until auto-decline.
          const pi = event.data.object;
          const booking = await prisma.booking.findUnique({
            where: { stripePaymentIntentId: pi.id },
            include: { chatThread: true },
          });
          if (!booking) break;
          if (booking.status === 'pending' || booking.status === 'confirmed') {
            await prisma.booking.update({
              where: { id: booking.id },
              data: {
                status: 'errored',
                declineReason: booking.declineReason ?? `stripe:${pi.cancellation_reason ?? 'canceled'}`,
              },
            });
            if (booking.chatThread) {
              await prisma.chatMessage.create({
                data: {
                  threadId: booking.chatThread.id,
                  senderId: null,
                  kind: 'system',
                  body: 'Booking errored: payment was cancelled by the payment provider.',
                },
              });
            }
          }
          break;
        }
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
        case 'identity.verification_session.verified': {
          const session = event.data.object as Stripe.Identity.VerificationSession;
          const row = await prisma.identityVerification.findUnique({
            where: { stripeVerificationSessionId: session.id },
          });
          if (!row) break;
          const out = session.verified_outputs;
          const fullName = [out?.first_name, out?.last_name].filter(Boolean).join(' ') || null;
          const dob = out?.dob
            ? new Date(Date.UTC(out.dob.year ?? 1970, (out.dob.month ?? 1) - 1, out.dob.day ?? 1))
            : null;
          await prisma.identityVerification.update({
            where: { id: row.id },
            data: {
              status: 'verified',
              verifiedAt: new Date(),
              verifiedName: fullName,
              verifiedDob: dob,
              verifiedAddress: out?.address ? (out.address as unknown as object) : undefined,
              documentLast4: out?.id_number?.slice(-4) ?? null,
              documentType: (session.last_verification_report as unknown as { document?: { type?: string } })?.document?.type ?? null,
              failureReason: null,
            },
          });
          break;
        }
        case 'identity.verification_session.requires_input': {
          const session = event.data.object as Stripe.Identity.VerificationSession;
          await prisma.identityVerification.updateMany({
            where: { stripeVerificationSessionId: session.id },
            data: {
              status: 'requires_input',
              failureReason: session.last_error?.code ?? 'document_unverified_other',
            },
          });
          break;
        }
        case 'identity.verification_session.canceled': {
          const session = event.data.object as Stripe.Identity.VerificationSession;
          await prisma.identityVerification.updateMany({
            where: { stripeVerificationSessionId: session.id },
            data: { status: 'canceled' },
          });
          break;
        }
        default:
          logger.debug({ type: event.type }, 'stripe event unhandled');
      }
      // Stamp `processedAt` so a concurrent retry of the same event sees
      // it as already processed (race-safe dedup).
      await prisma.stripeWebhookEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date() },
      });
    } catch (err) {
      // AUDIT: never silently swallow — log + Sentry so we can alert on webhook
      // failures that would otherwise appear as Stripe-side retries only.
      // We intentionally don't stamp `processedAt` here, so Stripe's retry
      // gets a fresh shot at the handler.
      logger.error({ err, eventId: event.id, type: event.type }, 'stripe webhook handler error');
      Sentry.captureException(err);
      return reply.code(500).send({ error: 'handler failed' });
    }
    return { received: true };
  });
};
