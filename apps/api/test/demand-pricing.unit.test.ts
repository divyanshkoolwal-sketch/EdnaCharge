/**
 * Demand-based pricing tiers, sourced from the EDNA financial model surge
 * table. Tiers are evaluated in America/Los_Angeles. We pick UTC instants in
 * January (always PST = UTC-8, no DST ambiguity) so the local hour is exact.
 */
import { describe, it, expect } from 'vitest';
import {
  demandTierAt,
  demandRateCents,
  DEMAND_RATE_CENTS,
} from '../src/lib/demand-pricing.js';

// Helper: a UTC instant that lands on `ptHour` Pacific Standard Time.
// PST = UTC-8, so PT hour H → UTC hour (H + 8) mod 24 (with day rollover).
function atPT(ptHour: number, minute = 0): Date {
  const utcHour = (ptHour + 8) % 24;
  const day = ptHour + 8 >= 24 ? 16 : 15;
  const hh = String(utcHour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return new Date(`2026-01-${day}T${hh}:${mm}:00Z`);
}

describe('demand pricing tiers', () => {
  it('off-peak: midnight–3pm → 49¢', () => {
    for (const h of [0, 2, 10, 14]) {
      expect(demandTierAt(atPT(h))).toBe('off_peak');
      expect(demandRateCents(atPT(h))).toBe(49);
    }
  });

  it('standard: 3–4pm and 9pm–midnight → 68¢', () => {
    expect(demandTierAt(atPT(15))).toBe('standard'); // 3pm
    expect(demandTierAt(atPT(15, 30))).toBe('standard');
    expect(demandTierAt(atPT(21))).toBe('standard'); // 9pm
    expect(demandTierAt(atPT(23))).toBe('standard');
    expect(demandRateCents(atPT(22))).toBe(68);
  });

  it('peak: 4–9pm → 86¢', () => {
    for (const h of [16, 17, 19, 20]) {
      expect(demandTierAt(atPT(h))).toBe('peak');
      expect(demandRateCents(atPT(h))).toBe(86);
    }
  });

  it('boundaries: 4pm is peak, 9pm flips to standard, 3pm is standard', () => {
    expect(demandTierAt(atPT(16))).toBe('peak'); // inclusive start of peak
    expect(demandTierAt(atPT(21))).toBe('standard'); // peak ends at 9pm
    expect(demandTierAt(atPT(15))).toBe('standard'); // off-peak ends at 3pm
    expect(demandTierAt(atPT(14, 59))).toBe('off_peak');
  });

  it('rate table matches the financial model', () => {
    expect(DEMAND_RATE_CENTS.off_peak).toBe(49);
    expect(DEMAND_RATE_CENTS.standard).toBe(68);
    expect(DEMAND_RATE_CENTS.peak).toBe(86);
    expect(DEMAND_RATE_CENTS.super_peak).toBe(99);
  });
});
