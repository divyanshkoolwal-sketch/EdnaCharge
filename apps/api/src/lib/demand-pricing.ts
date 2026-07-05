// Demand-based (surge) pricing.
//
// Pricing is set automatically by EdnaCharge — hosts do NOT enter a rate. The
// $/kWh rate is driven by demand, which for EV charging is dominated by
// time-of-day: peak evening hours carry a premium; overnight/daytime off-peak
// is discounted. The tiers and rates below are taken directly from the EDNA
// financial model (EDNA_Financial_Model_v5.xlsx, "Assumptions" → "SURGE
// PRICING — Driver Rates"), which is what the platform's revenue projections
// are built on, so app pricing stays consistent with the business model.
//
// Windows are evaluated in the charger's market timezone. v1 launches in
// California on the PG&E EV2-A rate basis, so we use America/Los_Angeles.
// (When we expand beyond CA this should become per-charger from lat/lng.)

export const PRICING_TZ = 'America/Los_Angeles';

export type DemandTier = 'off_peak' | 'standard' | 'peak' | 'super_peak';

// $/kWh in cents, per the financial model's surge tiers.
export const DEMAND_RATE_CENTS: Record<DemandTier, number> = {
  off_peak: 49, // midnight–3pm
  standard: 68, // 3–4pm and 9pm–midnight
  peak: 86, // 4–9pm (demand premium)
  super_peak: 99, // CAISO flex-alert events (rare; not auto-triggered)
};

const TIER_LABEL: Record<DemandTier, string> = {
  off_peak: 'Off-peak',
  standard: 'Standard',
  peak: 'Peak demand',
  super_peak: 'Super-peak',
};

/** Local hour (0–23) at the charger's market timezone, independent of server TZ. */
function localHour(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(at);
  const raw = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  // Intl can emit "24" for midnight in hour12:false — normalize to 0.
  return raw === 24 ? 0 : raw;
}

/** The demand tier in effect at a given instant. */
export function demandTierAt(at: Date, tz: string = PRICING_TZ): DemandTier {
  const h = localHour(at, tz);
  if (h >= 16 && h < 21) return 'peak'; // 4pm–9pm
  if (h === 15 || h >= 21) return 'standard'; // 3–4pm, 9pm–midnight
  return 'off_peak'; // midnight–3pm
}

/** The current demand-based $/kWh rate (cents) at a given instant. */
export function demandRateCents(at: Date, tz: string = PRICING_TZ): number {
  return DEMAND_RATE_CENTS[demandTierAt(at, tz)];
}

/** Human-readable tier label for UI (e.g. "Peak demand"). */
export function demandTierLabel(at: Date, tz: string = PRICING_TZ): string {
  return TIER_LABEL[demandTierAt(at, tz)];
}
