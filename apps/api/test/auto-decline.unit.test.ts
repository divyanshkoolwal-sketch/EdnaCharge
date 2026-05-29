/**
 * Regression test for the auto_decline jobId mismatch.
 *
 * History: `booking.respond` removed `auto_decline:${id}` (colon) but the
 * scheduler at the bottom of booking.ts uses `auto_decline_${id}` (underscore).
 * The remove never matched → after a host accepted, the auto-decline job
 * still fired 30 min later, flipping the booking back to declined.
 *
 * This test asserts the two strings stay in sync forever.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('auto_decline jobId convention', () => {
  it('booking.ts schedule + cancel use the same jobId pattern', () => {
    const path = join(__dirname, '../src/routers/booking.ts');
    const src = readFileSync(path, 'utf8');

    // Find every reference to auto_decline_${...} or auto_decline:${...}
    const matches = [...src.matchAll(/auto_decline[_:]\$\{[^}]+\}/g)].map((m) => m[0]);
    expect(matches.length).toBeGreaterThanOrEqual(2);

    // All references must use the underscore separator. Mixing : and _ caused
    // the original bug (cancel never matched the scheduled job's id).
    for (const m of matches) {
      expect(m, `Found auto_decline reference using ':' instead of '_': ${m}`).toMatch(
        /auto_decline_/,
      );
    }
  });

  it('settings copy in deleteAccount cancels in-flight payment intents', () => {
    const path = join(__dirname, '../src/routers/auth.ts');
    const src = readFileSync(path, 'utf8');

    // Sanity: deleteAccount mutation exists and cancels PIs before deleting.
    expect(src).toMatch(/deleteAccount: protectedProcedure/);
    expect(src).toMatch(/paymentIntents\.cancel/);
    expect(src).toMatch(/account_deletion/); // idempotency key suffix
  });

  it('booking.requestBooking re-checks charger.published on write', () => {
    const path = join(__dirname, '../src/routers/booking.ts');
    const src = readFileSync(path, 'utf8');

    // Sanity: the race-window guard from §2.11 of the audit plan is in place.
    expect(src).toMatch(/!charger\.published \|\| charger\.status === 'offline'/);
  });
});
