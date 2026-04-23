import Stripe from 'stripe';
import { logger } from '../logger.js';

let _stripe: Stripe | null = null;

export function stripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    logger.error('STRIPE_SECRET_KEY missing');
    throw new Error('Stripe env not configured');
  }
  _stripe = new Stripe(key, { apiVersion: '2024-06-20' });
  return _stripe;
}

export const PLATFORM_FEE_BPS = 1500; // 15% per PRD §1

export function platformFeeCents(amountCents: number): number {
  return Math.round((amountCents * PLATFORM_FEE_BPS) / 10_000);
}
