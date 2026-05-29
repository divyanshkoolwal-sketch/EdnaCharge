import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { prisma } from '@edna/db';
import { stripe, devBypassStripe } from '../lib/stripe.js';
import { SetDefaultPaymentMethodInputZ } from '@edna/schemas';

const DEV_PM_ID = 'pm_dev_card';
const DEV_CUSTOMER_PREFIX = 'cus_dev_';

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
  const customer = await stripe().customers.create({
    email,
    metadata: { ednaUserId: userId },
  });
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
    return {
      setupIntentClientSecret: si.client_secret!,
      customerId,
      ephemeralKey: ephemeralKey.secret!,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? '',
      devBypass: false as const,
    };
  }),

  listPaymentMethods: protectedProcedure.query(async ({ ctx }) => {
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
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [todayPayouts, activeBookings, weekPayouts] = await Promise.all([
      prisma.payout.aggregate({
        where: { hostId: ctx.userId, createdAt: { gte: startOfToday } },
        _sum: { netCents: true },
        _count: { _all: true },
      }),
      prisma.booking.count({
        where: { charger: { hostId: ctx.userId }, status: 'active' },
      }),
      prisma.payout.findMany({
        where: { hostId: ctx.userId, createdAt: { gte: sevenDaysAgo } },
        select: { netCents: true, createdAt: true },
      }),
    ]);

    // Bucket the last 7 days, [oldest, ..., today].
    const buckets: { dayLabel: string; date: string; netCents: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      const sum = weekPayouts
        .filter((p) => p.createdAt >= d && p.createdAt < next)
        .reduce((acc, p) => acc + p.netCents, 0);
      buckets.push({
        dayLabel: d.toLocaleDateString(undefined, { weekday: 'short' }),
        date: d.toISOString().slice(0, 10),
        netCents: sum,
      });
    }

    return {
      todayNetCents: todayPayouts._sum.netCents ?? 0,
      todaySessionCount: todayPayouts._count._all,
      activeSessionCount: activeBookings,
      weekly: buckets,
    };
  }),

  setDefault: protectedProcedure
    .input(SetDefaultPaymentMethodInputZ)
    .mutation(async ({ ctx, input }) => {
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
});
