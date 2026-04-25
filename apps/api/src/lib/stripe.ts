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

export const PLATFORM_FEE_BPS = 1500; // 15% per PRD §1

export function platformFeeCents(amountCents: number): number {
  return Math.round((amountCents * PLATFORM_FEE_BPS) / 10_000);
}
