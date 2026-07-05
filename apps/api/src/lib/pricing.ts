import { platformFeeCents } from './stripe.js';

export type Estimate = {
  estimatedKwh: number;
  ratePerKwhCents: number;
  energyCostCents: number;
  platformFeeCents: number;
  totalCents: number;
};

/**
 * Estimate the cost of a booking at an explicit demand-based rate.
 *
 * Pricing is $/kWh only (demand-based, computed in demand-pricing.ts). Energy is
 * estimated as the charger's power (kW) × duration (hours) = kWh. The rate is
 * passed in explicitly so the SAME function serves quote-time and any re-quote,
 * and the caller locks the rate on the Booking so the pre-auth and the final
 * capture always agree.
 */
export function estimateBooking(
  ratePerKwhCents: number,
  powerKw: number,
  startAt: Date,
  endAt: Date,
): Estimate {
  const hours = Math.max(0.1, (endAt.getTime() - startAt.getTime()) / 3_600_000);
  const estimatedKwh = powerKw * hours;
  const energyCost = Math.round(ratePerKwhCents * estimatedKwh);
  const fee = platformFeeCents(energyCost);
  return {
    estimatedKwh,
    ratePerKwhCents,
    energyCostCents: energyCost,
    platformFeeCents: fee,
    totalCents: energyCost + fee,
  };
}
