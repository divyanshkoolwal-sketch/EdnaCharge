import type { Charger } from '@edna/db';
import { platformFeeCents } from './stripe.js';

export type Estimate = {
  estimatedKwh: number;
  energyCostCents: number;
  platformFeeCents: number;
  totalCents: number;
};

export function estimateBooking(charger: Charger, startAt: Date, endAt: Date): Estimate {
  const hours = Math.max(0.1, (endAt.getTime() - startAt.getTime()) / 3_600_000);
  let energyCost: number;
  let estimatedKwh: number;
  if (charger.pricePerHourCents) {
    estimatedKwh = charger.powerKw * hours;
    energyCost = Math.round(charger.pricePerHourCents * hours);
  } else if (charger.pricePerKwhCents) {
    estimatedKwh = charger.powerKw * hours;
    energyCost = Math.round(charger.pricePerKwhCents * estimatedKwh);
  } else {
    estimatedKwh = 0;
    energyCost = 0;
  }
  const fee = platformFeeCents(energyCost);
  return {
    estimatedKwh,
    energyCostCents: energyCost,
    platformFeeCents: fee,
    totalCents: energyCost + fee,
  };
}
