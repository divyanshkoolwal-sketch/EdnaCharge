import { router, protectedProcedure } from '../trpc.js';
import { prisma } from '@edna/db';
import { stripe } from '../lib/stripe.js';
import { SetDefaultPaymentMethodInputZ } from '@edna/schemas';

async function ensureStripeCustomer(userId: string, email: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.stripeCustomerId) return user.stripeCustomerId;
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
    };
  }),

  listPaymentMethods: protectedProcedure.query(async ({ ctx }) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
    if (!user.stripeCustomerId) return { paymentMethods: [], defaultPaymentMethodId: null };
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
