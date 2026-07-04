/** @file apps/api/src/routers/payment.ts. */
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { prisma } from '@edna/db';
import { stripe, devBypassStripe } from '../lib/stripe.js';
import { SetDefaultPaymentMethodInputZ, DetachPaymentMethodInputZ } from '@edna/schemas';
import { requireUserAccess } from '../lib/access.js';

const DEV_PM_ID = 'pm_dev_card';
const DEV_CUSTOMER_PREFIX = 'cus_dev_';
const MARKET_TIME_ZONE = 'America/Los_Angeles';

function marketDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MARKET_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return {
    key: `${value('year')}-${value('month')}-${value('day')}`,
    weekday: value('weekday'),
  };
}

async function ensureStripeCustomer(userId: string, email: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  // Existing real customer — use it.
  if (user.stripeCustomerId && !user.stripeCustomerId.startsWith(DEV_CUSTOMER_PREFIX)) {
    return user.stripeCustomerId;
  }

  // Dev bypass: stamp a placeholder customer id so booking precondition
  // checks (`!driver.stripeCustomerId`) pass in demo mode.
  if (devBypassStripe()) {
    const customerId = `${DEV_CUSTOMER_PREFIX}${userId.slice(0, 8)}`;
    await prisma.user.update({
      where: { id: userId },
      data: { stripeCustomerId: customerId, defaultPaymentMethodId: DEV_PM_ID },
    });
    return customerId;
  }

  // Real Stripe is now live but we have a leftover `cus_dev_*` customer id
  // (or no customer at all) from earlier dev-bypass state. Create a real
  // customer and clear the placeholder default PM at the same time.
  const customer = await stripe().customers.create(
    { email, metadata: { ednaUserId: userId } },
    // Idempotent on the user so a double-tap / retry can't create two Stripe
    // customers for the same account. (SetupIntent/ephemeralKey are intentionally
    // NOT keyed — a per-user key would collapse legitimate sequential card-adds
    // within Stripe's 24h window; unused SetupIntents expire harmlessly.)
    { idempotencyKey: `customer:${userId}` },
  );
  await prisma.user.update({
    where: { id: userId },
    data: {
      stripeCustomerId: customer.id,
      // Clear `pm_dev_card` so the booking precondition forces a real card.
      defaultPaymentMethodId:
        user.defaultPaymentMethodId === DEV_PM_ID ? null : user.defaultPaymentMethodId,
    },
  });
  return customer.id;
}

export const paymentRouter = router({
  setupIntent: protectedProcedure.mutation(async ({ ctx }) => {
    await requireUserAccess(ctx.userId, 'driver');
    if (devBypassStripe()) {
      // Dev bypass — caller decides whether to render a "cards disabled" banner.
      // We still ensure the User has a placeholder customer + default PM so
      // booking.requestBooking precondition passes downstream.
      const customerId = await ensureStripeCustomer(ctx.userId, ctx.email);
      return {
        setupIntentClientSecret: '',
        customerId,
        ephemeralKey: '',
        publishableKey: '',
        devBypass: true as const,
      };
    }
    const customerId = await ensureStripeCustomer(ctx.userId, ctx.email);
    const s = stripe();
    const si = await s.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      usage: 'off_session',
    });
    const ephemeralKey = await s.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: '2024-06-20' },
    );
    const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
    if (!publishableKey) {
      throw new TRPCError({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Stripe publishable key is not configured on the API.',
      });
    }
    return {
      setupIntentClientSecret: si.client_secret!,
      customerId,
      ephemeralKey: ephemeralKey.secret!,
      publishableKey,
      devBypass: false as const,
    };
  }),

  listPaymentMethods: protectedProcedure.query(async ({ ctx }) => {
    await requireUserAccess(ctx.userId, 'driver');
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
    if (devBypassStripe()) {
      // Show one fake "Dev Card" so the driver's UI looks populated and the
      // request-booking precondition passes.
      return {
        paymentMethods: [
          {
            id: DEV_PM_ID,
            brand: 'visa',
            last4: '4242',
            expMonth: 12,
            expYear: new Date().getFullYear() + 2,
          },
        ],
        defaultPaymentMethodId: user.defaultPaymentMethodId ?? DEV_PM_ID,
        devBypass: true as const,
      };
    }
    // No customer id yet, OR a leftover dev placeholder from when bypass was on.
    // Real Stripe wouldn't recognise `cus_dev_*` and would 500 — return empty
    // instead so the UI just shows "No cards yet" + an Add card button.
    if (!user.stripeCustomerId || user.stripeCustomerId.startsWith(DEV_CUSTOMER_PREFIX)) {
      return {
        paymentMethods: [],
        defaultPaymentMethodId: null,
        devBypass: false as const,
      };
    }
    const s = stripe();
    const pms = await s.paymentMethods.list({
      customer: user.stripeCustomerId,
      type: 'card',
    });
    return {
      paymentMethods: pms.data.map((pm) => ({
        id: pm.id,
        brand: pm.card?.brand ?? 'card',
        last4: pm.card?.last4 ?? '',
        expMonth: pm.card?.exp_month ?? 0,
        expYear: pm.card?.exp_year ?? 0,
      })),
      defaultPaymentMethodId: user.defaultPaymentMethodId,
      devBypass: false as const,
    };
  }),

  // Aggregated host-side stats: today's earnings, current active sessions,
  // and a 7-day earnings rollup for the home + earnings screens.
  // Uses the `Payout` table which is created by `settle-session` after every
  // successful capture. `netCents` excludes the platform fee.
  hostStats: protectedProcedure.query(async ({ ctx }) => {
    await requireUserAccess(ctx.userId, 'host');
    const todayKey = marketDateParts(new Date()).key;
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);

    const [activeBookings, weekPayouts, lifetime] = await Promise.all([
      prisma.booking.count({
        where: { charger: { hostId: ctx.userId }, status: 'active' },
      }),
      prisma.payout.findMany({
        // Exclude payouts reversed by a refund / lost dispute — Stripe clawed
        // those funds back, so they must not count toward host earnings.
        where: { hostId: ctx.userId, createdAt: { gte: eightDaysAgo }, reversedAt: null },
        select: { netCents: true, createdAt: true },
      }),
      prisma.payout.aggregate({
        where: { hostId: ctx.userId, reversedAt: null },
        _sum: { grossCents: true, netCents: true },
      }),
    ]);

    // Bucket the last 7 days, [oldest, ..., today].
    const buckets: { dayLabel: string; date: string; netCents: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const { key, weekday } = marketDateParts(new Date(Date.now() - i * 24 * 60 * 60 * 1000));
      const sum = weekPayouts
        .filter((p) => marketDateParts(p.createdAt).key === key)
        .reduce((acc, p) => acc + p.netCents, 0);
      buckets.push({
        dayLabel: weekday,
        date: key,
        netCents: sum,
      });
    }
    const todayPayouts = weekPayouts.filter((p) => marketDateParts(p.createdAt).key === todayKey);

    return {
      todayNetCents: todayPayouts.reduce((acc, p) => acc + p.netCents, 0),
      todaySessionCount: todayPayouts.length,
      activeSessionCount: activeBookings,
      lifetimeGrossCents: lifetime._sum.grossCents ?? 0,
      lifetimeNetCents: lifetime._sum.netCents ?? 0,
      weekly: buckets,
    };
  }),

  setDefault: protectedProcedure
    .input(SetDefaultPaymentMethodInputZ)
    .mutation(async ({ ctx, input }) => {
      await requireUserAccess(ctx.userId, 'driver');
      const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
      if (!user.stripeCustomerId) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Create a customer first.' });
      }

      const pm = await stripe().paymentMethods.retrieve(input.paymentMethodId);
      const customerId = typeof pm.customer === 'string' ? pm.customer : pm.customer?.id;
      if (customerId !== user.stripeCustomerId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Payment method is not attached to this customer.',
        });
      }

      await prisma.user.update({
        where: { id: ctx.userId },
        data: { defaultPaymentMethodId: input.paymentMethodId },
      });
      return { ok: true };
    }),

  // Remove a saved card. Stripe has no "edit card" API — changing a card means
  // detach + add a new one. If the removed card was the default, we reassign the
  // default to a remaining card (or clear it) so a booking can never reference a
  // detached payment method.
  detachPaymentMethod: protectedProcedure
    .input(DetachPaymentMethodInputZ)
    .mutation(async ({ ctx, input }) => {
      await requireUserAccess(ctx.userId, 'driver');
      if (devBypassStripe()) {
        // No real Stripe in dev bypass — the single fake card can't be removed.
        return { ok: true as const };
      }
      const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
      if (!user.stripeCustomerId || user.stripeCustomerId.startsWith(DEV_CUSTOMER_PREFIX)) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'No payment account yet.' });
      }
      const s = stripe();

      // Ownership check — never let a user detach a PM that isn't theirs.
      const pm = await s.paymentMethods.retrieve(input.paymentMethodId);
      const customerId = typeof pm.customer === 'string' ? pm.customer : pm.customer?.id;
      if (customerId !== user.stripeCustomerId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Payment method is not attached to this customer.',
        });
      }

      await s.paymentMethods.detach(input.paymentMethodId);

      // If we just removed the default card, promote another remaining card (or
      // clear the default entirely) so nothing points at a dead PM.
      if (user.defaultPaymentMethodId === input.paymentMethodId) {
        const remaining = await s.paymentMethods.list({
          customer: user.stripeCustomerId,
          type: 'card',
        });
        await prisma.user.update({
          where: { id: ctx.userId },
          data: { defaultPaymentMethodId: remaining.data[0]?.id ?? null },
        });
      }
      return { ok: true as const };
    }),
});
