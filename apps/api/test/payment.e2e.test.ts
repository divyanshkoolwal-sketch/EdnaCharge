/**
 * Payment e2e — setupIntent returns a usable client_secret, and listPaymentMethods
 * reflects a card attached via Stripe test-mode.
 *
 * docs/AGENT_CONTEXT.md: real Stripe test-mode, no HTTP mocking. When
 * secrets are absent the suite marks itself SKIP (surfaced by vitest), never
 * fakes a pass.
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
  grantAccess,
} from './helpers.js';

const skip = skipReason([
  ['SUPABASE_URL+ANON_KEY', HAS_SUPABASE],
  ['SUPABASE_SERVICE_ROLE_KEY', HAS_SERVICE_ROLE],
  ['STRIPE_SECRET_KEY', HAS_STRIPE],
]);
const d = skip ? describe.skip : describe;

d(`payment router ${skip ?? ''}`, () => {
  const email = uniqueEmail('pay');
  const password = 'Test-Pass-123!';
  let token = '';
  let userId = '';

  beforeAll(async () => {
    userId = await createSupabaseUser(email, password);
    token = await signIn(email, password);
    await grantAccess(userId, 'driver');
    await trpc('auth.getSession', token, undefined, 'query');
  });

  afterAll(async () => {
    await deleteUserByEmail(email);
  });

  it('setupIntent returns a client_secret + customer id', async () => {
    const res = (await trpc('payment.setupIntent', token, undefined)) as {
      setupIntentClientSecret: string;
      customerId: string;
    };
    expect(res.setupIntentClientSecret).toMatch(/^seti_/);
    expect(res.customerId).toMatch(/^cus_/);
  });

  it('listPaymentMethods reflects cards attached through Stripe test-mode', async () => {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' });
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const pm = await stripe.paymentMethods.create({
      type: 'card',
      card: { token: 'tok_visa' },
    });
    await stripe.paymentMethods.attach(pm.id, { customer: user.stripeCustomerId! });

    const list = (await trpc('payment.listPaymentMethods', token, undefined, 'query')) as {
      paymentMethods: Array<{ id: string; last4: string }>;
    };
    expect(list.paymentMethods.some((p) => p.id === pm.id)).toBe(true);
  });
});
