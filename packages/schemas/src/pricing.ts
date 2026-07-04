/** @file packages/schemas/src/pricing.ts. */
export const PRICING_TZ = 'America/Los_Angeles';

export type DemandTier = 'off_peak' | 'standard' | 'peak';

export const DEMAND_RATE_CENTS: Record<DemandTier, number> = {
  off_peak: 49,
  standard: 68,
  peak: 86,
};

const TIER_LABEL: Record<DemandTier, string> = {
  off_peak: 'Off-peak',
  standard: 'Standard',
  peak: 'Peak demand',
};

function localHour(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(at);
  const raw = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  return raw === 24 ? 0 : raw;
}

export function demandTierAt(at: Date, tz: string = PRICING_TZ): DemandTier {
  const h = localHour(at, tz);
  if (h >= 16 && h < 21) return 'peak';
  if (h === 15 || h >= 21) return 'standard';
  return 'off_peak';
}

export function demandRateCents(at: Date, tz: string = PRICING_TZ): number {
  return DEMAND_RATE_CENTS[demandTierAt(at, tz)];
}

export function demandTierLabel(at: Date, tz: string = PRICING_TZ): string {
  return TIER_LABEL[demandTierAt(at, tz)];
}
