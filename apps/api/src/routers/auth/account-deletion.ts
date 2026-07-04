/** Account deletion procedure and external cleanup. */
import { TRPCError } from '@trpc/server';
import { prisma, type BookingStatus } from '@edna/db';
import { protectedProcedure } from '../../trpc.js';
import { stripe, devBypassStripe } from '../../lib/stripe.js';
import { notificationsQueue } from '../../lib/queues.js';
import { logger } from '../../logger.js';
import { supabase } from '../../lib/supabase.js';

const OPEN_BOOKING_STATUSES: BookingStatus[] = ['pending', 'confirmed', 'active'];

type BookingPaymentRef = {
  id: string;
  status?: BookingStatus;
  stripePaymentIntentId: string | null;
};

type AccountDeletionPaymentIntent = { bookingId: string; paymentIntentId: string };

export function accountDeletionPaymentIntents(bookings: BookingPaymentRef[]) {
  const byBooking = new Map<string, AccountDeletionPaymentIntent>();
  for (const booking of bookings) {
    const paymentIntentId = booking.stripePaymentIntentId;
    if (!paymentIntentId || paymentIntentId.startsWith('pi_dev_')) continue;
    if (!byBooking.has(booking.id)) {
      byBooking.set(booking.id, { bookingId: booking.id, paymentIntentId });
    }
  }
  return [...byBooking.values()];
}

export function accountDeletionBlockingBookings(bookings: BookingPaymentRef[]) {
  const byBooking = new Map<string, { bookingId: string }>();
  for (const booking of bookings) {
    if (booking.status !== 'active') continue;
    byBooking.set(booking.id, { bookingId: booking.id });
  }
  return [...byBooking.values()];
}

/**
 * Idempotent-resume guard: a user whose deletedAt is already set has been
 * anonymized, so a retried deleteAccount must short-circuit rather than re-run
 * the (external, non-transactional) Stripe/Supabase teardown. Pure so a unit
 * test pins the invariant.
 */
export function isAlreadyDeleted(user: { deletedAt: Date | null }): boolean {
  return user.deletedAt != null;
}

export async function cancelAccountDeletionPaymentIntents(
  refs: AccountDeletionPaymentIntent[],
  cancelPaymentIntent: (ref: AccountDeletionPaymentIntent) => Promise<void>,
) {
  for (const ref of refs) {
    try {
      await cancelPaymentIntent(ref);
    } catch (err) {
      logger.warn(
        { err, bookingId: ref.bookingId, paymentIntentId: ref.paymentIntentId },
        'deleteAccount: Stripe hold cancellation failed',
      );
      throw new TRPCError({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Could not release an open booking hold. Please try again.',
      });
    }
  }
}

export const deleteAccount = protectedProcedure.mutation(async ({ ctx }) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: ctx.userId },
    include: {
      driverBookings: {
        where: { status: { in: OPEN_BOOKING_STATUSES } },
        select: { id: true, status: true, stripePaymentIntentId: true },
      },
      hostProfile: true,
    },
  });
  // Idempotent resume: a retry after a previous partially-completed run (e.g.
  // Supabase auth user deleted but a later step failed) short-circuits once anonymized.
  if (isAlreadyDeleted(user)) return { ok: true as const };
  const hostedBookings = await prisma.booking.findMany({
    where: {
      charger: { hostId: ctx.userId },
      status: { in: OPEN_BOOKING_STATUSES },
    },
    select: { id: true, status: true, stripePaymentIntentId: true },
  });
  const openBookings = [...user.driverBookings, ...hostedBookings];
  const activeBookings = accountDeletionBlockingBookings(openBookings);
  if (activeBookings.length > 0) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Stop and settle active charging sessions before deleting your account.',
    });
  }
  if (!devBypassStripe()) {
    const s = stripe();
    await cancelAccountDeletionPaymentIntents(
      accountDeletionPaymentIntents(openBookings),
      async (ref) => {
        await s.paymentIntents.cancel(ref.paymentIntentId, undefined, {
          idempotencyKey: `cancel:${ref.bookingId}:account_deletion`,
        });
      },
    );
    if (user.stripeCustomerId && !user.stripeCustomerId.startsWith('cus_dev_')) {
      try {
        await s.customers.del(user.stripeCustomerId);
      } catch {
        // Already gone or restricted.
      }
    }
    const accountId = user.hostProfile?.stripeAccountId;
    if (accountId && !accountId.startsWith('acct_dev_')) {
      try {
        await s.accounts.reject(accountId, { reason: 'other' });
      } catch {
        // Already rejected / not rejectable.
      }
    }
  }

  // Delete the Supabase auth user (User.id === auth.users.id) so the sign-in
  // credential is gone too, not just the app profile. Best-effort and tolerant
  // of an already-deleted user, so a retried deletion (before the txn below
  // commits deletedAt) resumes cleanly instead of failing on user-not-found.
  const sb = supabase();
  if (sb) {
    try {
      await sb.auth.admin.deleteUser(ctx.userId);
    } catch (err) {
      logger.warn({ err, userId: ctx.userId }, 'deleteAccount: supabase auth delete failed');
    }
  }

  // ALL DB writes in ONE transaction so a mid-flight failure can never leave a
  // half-deleted account (e.g. Supabase credential gone but a live User row with
  // real PII). The external steps above are individually idempotent (PI cancels
  // keyed, Supabase auth delete tolerant of user-not-found, customer delete
  // tolerant), so if anything below throws the client can simply RETRY the whole
  // mutation and it resumes cleanly to the same end state.
  const openToCancel = await prisma.booking.findMany({
    where: {
      status: { in: ['pending', 'confirmed'] },
      OR: [{ driverId: ctx.userId }, { charger: { hostId: ctx.userId } }],
    },
    select: { id: true, driverId: true, charger: { select: { hostId: true } } },
  });
  await prisma.$transaction(async (tx) => {
    // Cancel open (non-active) bookings on either side so a counterparty is
    // never silently left with a reservation that won't happen.
    await tx.booking.updateMany({
      where: { id: { in: openToCancel.map((b) => b.id) }, status: { in: ['pending', 'confirmed'] } },
      data: { status: 'cancelled', declineReason: 'account_deleted' },
    });
    // Take this host's chargers off the marketplace (don't delete — that
    // cascades into other drivers' bookings/sessions).
    await tx.charger.updateMany({
      where: { hostId: ctx.userId },
      data: { published: false, status: 'offline' },
    });
    // Purge the user's OWN 1:1 PII records, then anonymize the User row in
    // place. Hard-deleting the User cascades through Chargers → other users'
    // Bookings → Reviews/Sessions/Payouts, destroying their history.
    await tx.driverProfile.deleteMany({ where: { userId: ctx.userId } });
    await tx.hostProfile.deleteMany({ where: { userId: ctx.userId } });
    await tx.identityVerification.deleteMany({ where: { userId: ctx.userId } });
    await tx.user.update({
      where: { id: ctx.userId },
      data: {
        deletedAt: new Date(),
        email: `deleted+${ctx.userId}@deleted.ednacharge.invalid`,
        phone: null,
        fullName: 'Deleted user',
        avatarUrl: null,
        expoPushToken: null,
        stripeCustomerId: null,
        defaultPaymentMethodId: null,
      },
    });
  });

  // Notify counterparties AFTER the transaction committed (never for a rolled-
  // back cancellation). Best-effort — a notify failure must not fail deletion.
  for (const bk of openToCancel) {
    const notifyHost = bk.driverId === ctx.userId; // the leaving user was the driver
    await notificationsQueue
      .add(
        'booking_cancelled',
        notifyHost
          ? { hostId: bk.charger.hostId, bookingId: bk.id }
          : { driverId: bk.driverId, bookingId: bk.id },
        { jobId: `cancel_deleted:${bk.id}` },
      )
      .catch((err) => logger.warn({ err, bookingId: bk.id }, 'deleteAccount: notify failed'));
  }
  return { ok: true as const };
});
