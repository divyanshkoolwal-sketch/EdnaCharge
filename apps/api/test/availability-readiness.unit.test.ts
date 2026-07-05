/** @file apps/api/test/availability-readiness.unit.test.ts. */
import { describe, expect, it } from 'vitest';
import { isWindowAvailable } from '../src/lib/availability.js';
import { isOcppReady } from '../src/lib/charger-readiness.js';

function julyPdt(day: number, hour: number, minute = 0): Date {
  return new Date(Date.UTC(2026, 6, day, hour + 7, minute));
}

describe('availability and OCPP readiness helpers', () => {
  it('treats empty legacy availability as always available', () => {
    const start = new Date('2026-07-06T18:00:00Z');
    const end = new Date('2026-07-06T19:00:00Z');
    expect(isWindowAvailable([], start, end)).toBe(true);
  });

  it('requires the full booking window to fit an explicit weekly slot', () => {
    const rows = [{ dow: 1, start: '09:00', end: '17:00' }];
    expect(isWindowAvailable(rows, julyPdt(6, 10), julyPdt(6, 11))).toBe(true);
    expect(isWindowAvailable(rows, julyPdt(6, 16, 30), julyPdt(6, 17, 30))).toBe(false);
  });

  it('rejects a short uncovered gap inside a booking window', () => {
    const rows = [
      { dow: 1, start: '09:00', end: '09:10' },
      { dow: 1, start: '09:11', end: '10:00' },
    ];
    expect(isWindowAvailable(rows, julyPdt(6, 9), julyPdt(6, 10))).toBe(false);
  });

  it('supports overnight availability windows', () => {
    const rows = [{ dow: 1, start: '22:00', end: '02:00' }];
    expect(isWindowAvailable(rows, julyPdt(6, 23, 30), julyPdt(7, 1, 30))).toBe(true);
    expect(isWindowAvailable(rows, julyPdt(7, 1, 30), julyPdt(7, 2, 30))).toBe(false);
  });

  it('treats a 23:59 end as end-of-day so all-week covers the midnight boundary', () => {
    // Legacy "all day" preset rows ended at 23:59. Without treating that as
    // end-of-day, the final minute (and any booking crossing midnight) was
    // wrongly rejected even though the charger is advertised available 24/7.
    const allWeek = Array.from({ length: 7 }, (_, dow) => ({ dow, start: '00:00', end: '23:59' }));
    // A Monday-night → Tuesday-morning booking spanning the 23:59 minute.
    expect(isWindowAvailable(allWeek, julyPdt(6, 23, 30), julyPdt(7, 0, 30))).toBe(true);
    // The final minute of the day is itself inside the window.
    expect(isWindowAvailable(allWeek, julyPdt(6, 23, 59), julyPdt(7, 0, 0))).toBe(true);
  });

  it('requires recent Tier 3 OCPP credentials and connection', () => {
    const now = new Date('2026-07-04T12:00:00Z');
    expect(
      isOcppReady(
        {
          hardwareTier: 'tier_3_native',
          ocppChargePointId: 'cp-1',
          ocppConnectedAt: now,
        },
        now,
      ),
    ).toBe(true);
    expect(
      isOcppReady(
        {
          hardwareTier: 'tier_3_native',
          ocppChargePointId: 'cp-1',
          ocppConnectedAt: new Date('1970-01-01T00:00:00Z'),
        },
        now,
      ),
    ).toBe(false);
  });
});
