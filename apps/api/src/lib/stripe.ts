import Stripe from 'stripe';
import { TRPCError } from '@trpc/server';
import { logger } from '../logger.js';

let _stripe: Stripe | null = null;

function isUsable(key: string | undefined): key is string {
  return typeof key === 'string' && key.length > 0 && key !== 'REPLACE_ME';
}

export function stripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!isUsable(key)) {
    logger.error('STRIPE_SECRET_KEY missing or unset');
    // Surface a 503 to clients instead of a 500 with a leaky internal message.
    // The front-end can show "Card storage is temporarily unavailable" without
    // exposing that we literally have no key.
    throw new TRPCError({
      code: 'SERVICE_UNAVAILABLE',
      message: 'Payments are not configured.',
    });
  }
  _stripe = new Stripe(key, { apiVersion: '2024-06-20' });
  return _stripe;
}

export function isStripeConfigured(): boolean {
  return isUsable(process.env.STRIPE_SECRET_KEY);
}

// Fake the entire Stripe surface so demos can complete onboarding + booking
// without real keys. To prevent staging environments from accidentally
// accepting the bypass, this requires BOTH:
//   1. NODE_ENV !== 'production'
//   2. ENABLE_DEV_BYPASS=1 set explicitly
// Default: bypass OFF. Production never takes this branch — even with missing
// keys, prod returns SERVICE_UNAVAILABLE instead of fabricating data.
export function devBypassStripe(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  if (process.env.ENABLE_DEV_BYPASS !== '1') return false;
  return !isStripeConfigured();
}

export const PLATFORM_FEE_BPS = 1500; // 15% per PRD §1

export function platformFeeCents(amountCents: number): number {
  return Math.round((amountCents * PLATFORM_FEE_BPS) / 10_000);
}
