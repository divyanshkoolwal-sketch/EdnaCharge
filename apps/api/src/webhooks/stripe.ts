/** @file apps/api/src/webhooks/stripe.ts. */
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import Stripe from 'stripe';
import { stripe } from '../lib/stripe.js';
import { grantHostAccess } from '../lib/access.js';
import { prisma } from '@edna/db';
import { logger } from '../logger.js';
import { Sentry } from '@edna/server-utils';
import {
  handleChargeRefunded,
  handleDispute,
  handlePaymentFailed,
  handlePayoutFailed,
} from './stripe-payment-events.js';

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
  scoped.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) =>
    done(null, body),
  );

  // Exempt from the global per-IP rate limit: Stripe delivers from a small pool
  // of egress IPs, so a burst of legit webhooks could otherwise trip 300/min and
  // force Stripe retries. Signature verification below is the real gate here.
  scoped.post('/webhooks/stripe', { config: { rateLimit: false } }, async (req, reply) => {
    // We run two Stripe webhook destinations that POST to this same endpoint:
    //  - account events (payment_intent.*, identity.*) signed by STRIPE_WEBHOOK_SECRET
    //  - connected-account events (account.updated) signed by STRIPE_WEBHOOK_SECRET_CONNECT
    // Each destination has its own signing secret, so verify against whichever
    // one matches. (Either may be unset; we only need one for a given event.)
    const secrets = [
      process.env.STRIPE_WEBHOOK_SECRET,
      process.env.STRIPE_WEBHOOK_SECRET_CONNECT,
    ].filter((s): s is string => typeof s === 'string' && s.length > 0);
    if (secrets.length === 0) {
      logger.error('No Stripe webhook secret set (STRIPE_WEBHOOK_SECRET[_CONNECT])');
      return reply.code(500).send({ error: 'webhook secret missing' });
    }
    const sig = req.headers['stripe-signature'];
    const sigHeader = Array.isArray(sig) ? (sig[0] ?? '') : (sig ?? '');
    let event: Stripe.Event | null = null;
    let lastErr: unknown;
    for (const secret of secrets) {
      try {
        event = stripe().webhooks.constructEvent(req.body as Buffer, sigHeader, secret);
        break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (!event) {
      logger.warn({ err: lastErr }, 'stripe signature verification failed (all secrets)');
      return reply.code(400).send({ error: 'bad signature' });
    }

    // Claim the event by inserting its id. The unique key is the lock: a
    // concurrent delivery cannot also enter the handler. If the handler fails
    // below we delete this claim so Stripe's retry can process the event.
    try {
      await prisma.stripeWebhookEvent.create({
        data: { id: event.id, type: event.type },
      });
    } catch (err) {
      // Row already exists. If a prior delivery fully PROCESSED it (processedAt
      // set), this is a genuine duplicate — ack and stop. If it was only claimed
      // but never processed (processedAt still null, e.g. the process was killed
      // before the handler finished AND before its cleanup delete ran), fall
      // through and re-run the handler so a crashed event isn't lost forever on
      // Stripe's retry.
      const existing = await prisma.stripeWebhookEvent.findUnique({
        where: { id: event.id },
        select: { processedAt: true },
      });
      if (existing?.processedAt != null) {
        logger.info(
          { eventId: event.id, type: event.type },
          'stripe event already processed (duplicate)',
        );
        return { received: true, duplicate: true };
      }
      logger.warn(
        { eventId: event.id, type: event.type },
        'stripe event claimed but unprocessed — reprocessing on retry',
      );
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
              // Host procedures gate on the UserAccessGrant, not User.roles —
              // grant it here too or a Stripe-onboarded host stays FORBIDDEN.
              await grantHostAccess(profile.userId);
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
                declineReason:
                  booking.declineReason ?? `stripe:${pi.cancellation_reason ?? 'canceled'}`,
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
            const fresh = await stripe().paymentIntents.retrieve(pi.id, {
              expand: ['latest_charge'],
            });
            const charge =
              fresh.latest_charge && typeof fresh.latest_charge !== 'string'
                ? fresh.latest_charge
                : null;
            await prisma.booking.update({
              where: { id: booking.id },
              data: {
                capturedAmountCents: pi.amount_received,
                stripeChargeId: charge?.id ?? booking.stripeChargeId,
                stripeReceiptUrl: charge?.receipt_url ?? booking.stripeReceiptUrl,
              },
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
              documentType:
                (session.last_verification_report as unknown as { document?: { type?: string } })
                  ?.document?.type ?? null,
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
        case 'payment_intent.payment_failed':
          await handlePaymentFailed(event.data.object);
          break;
        case 'charge.refunded':
          await handleChargeRefunded(event.data.object);
          break;
        case 'charge.dispute.created':
        case 'charge.dispute.closed':
          await handleDispute(event.data.object, event.type === 'charge.dispute.created');
          break;
        case 'payout.failed':
          handlePayoutFailed(event.data.object);
          break;
        default:
          logger.debug({ type: event.type }, 'stripe event unhandled');
      }
      await prisma.stripeWebhookEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date() },
      });
    } catch (err) {
      // AUDIT: never silently swallow — log + Sentry so we can alert on webhook
      // failures that would otherwise appear as Stripe-side retries only.
      // We intentionally don't stamp `processedAt` here, so Stripe's retry
      // gets a fresh shot at the handler.
      await prisma.stripeWebhookEvent.delete({ where: { id: event.id } }).catch(() => {});
      logger.error({ err, eventId: event.id, type: event.type }, 'stripe webhook handler error');
      Sentry.captureException(err);
      return reply.code(500).send({ error: 'handler failed' });
    }
    return { received: true };
  });
};
