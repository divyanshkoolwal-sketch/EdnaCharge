import { router, protectedProcedure } from '../trpc.js';
import { prisma } from '@edna/db';
import { stripe, devBypassStripe } from '../lib/stripe.js';
import { SetDefaultPaymentMethodInputZ } from '@edna/schemas';

const DEV_PM_ID = 'pm_dev_card';
const DEV_CUSTOMER_PREFIX = 'cus_dev_';

async function ensureStripeCustomer(userId: string, email: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.stripeCustomerId) return user.stripeCustomerId;
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
  const customer = await stripe().customers.create({
    email,
    metadata: { ednaUserId: userId },
  });
  await prisma.user.update({
    where: { id: userId },
    data: { stripeCustomerId: customer.id },
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
    if (!user.stripeCustomerId)
      return {
        paymentMethods: [],
        defaultPaymentMethodId: null,
        devBypass: false as const,
      };
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

  setDefault: protectedProcedure
    .input(SetDefaultPaymentMethodInputZ)
    .mutation(async ({ ctx, input }) => {
      await prisma.user.update({
        where: { id: ctx.userId },
        data: { defaultPaymentMethodId: input.paymentMethodId },
      });
      return { ok: true };
    }),
});
