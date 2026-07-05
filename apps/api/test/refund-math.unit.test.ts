/** @file apps/api/test/refund-math.unit.test.ts. */
import { describe, expect, it } from 'vitest';
import { disputeStatusFor, refundedPayoutAmounts } from '../src/webhooks/stripe-payment-events.js';

// The refund/dispute reversal math has zero live coverage on a bare box (the
// real path is a Stripe webhook → DB write, gated behind E2E_LIVE). These pure
// helpers isolate the load-bearing arithmetic + status mapping so the highest-
// risk money logic is verified on every `pnpm test`.
describe('refundedPayoutAmounts', () => {
  it('fully reverses when the cumulative refund meets or exceeds the original capture', () => {
    expect(
      refundedPayoutAmounts({ originalGross: 1000, platformFeeCents: 150, amountRefunded: 1000 }),
    ).toEqual({ reversed: true, netCents: 0, grossCents: 0 });
    // Over-refund (defensive) still fully reverses, never negative.
    expect(
      refundedPayoutAmounts({ originalGross: 1000, platformFeeCents: 150, amountRefunded: 1200 }),
    ).toEqual({ reversed: true, netCents: 0, grossCents: 0 });
  });

  it('claws back a partial refund proportionally on the host NET share', () => {
    // gross 1000, fee 150 → net 850. Refund 400 → kept 600.
    // net = round(850 * 600 / 1000) = 510; gross = kept = 600.
    expect(
      refundedPayoutAmounts({ originalGross: 1000, platformFeeCents: 150, amountRefunded: 400 }),
    ).toEqual({ reversed: false, netCents: 510, grossCents: 600 });
  });

  it('is idempotent — recomputing from the same cumulative refund yields the same result', () => {
    const args = { originalGross: 1000, platformFeeCents: 150, amountRefunded: 400 } as const;
    expect(refundedPayoutAmounts(args)).toEqual(refundedPayoutAmounts(args));
  });

  it('never emits negative amounts', () => {
    const r = refundedPayoutAmounts({
      originalGross: 500,
      platformFeeCents: 75,
      amountRefunded: 499,
    });
    expect(r.netCents).toBeGreaterThanOrEqual(0);
    expect(r.grossCents).toBeGreaterThanOrEqual(0);
  });

  it('short-circuits a zero-gross capture without dividing by zero', () => {
    expect(
      refundedPayoutAmounts({ originalGross: 0, platformFeeCents: 0, amountRefunded: 0 }),
    ).toEqual({ reversed: false, netCents: 0, grossCents: 0 });
  });
});

describe('disputeStatusFor', () => {
  it('maps a newly-created dispute to "open" regardless of the Stripe status', () => {
    expect(disputeStatusFor(true, 'needs_response')).toBe('open');
    expect(disputeStatusFor(true, 'warning_needs_response')).toBe('open');
  });

  it('maps won/lost closures through directly', () => {
    expect(disputeStatusFor(false, 'won')).toBe('won');
    expect(disputeStatusFor(false, 'lost')).toBe('lost');
  });

  it('passes through an intermediate status and falls back to "closed" on null', () => {
    expect(disputeStatusFor(false, 'under_review')).toBe('under_review');
    expect(disputeStatusFor(false, null)).toBe('closed');
    expect(disputeStatusFor(false, undefined)).toBe('closed');
  });

  it('only "lost" is the payout-reversing outcome', () => {
    // The webhook zeroes the Payout iff disputeStatus === 'lost'.
    const reversing = (created: boolean, s: string | null) => disputeStatusFor(created, s) === 'lost';
    expect(reversing(false, 'lost')).toBe(true);
    expect(reversing(false, 'won')).toBe(false);
    expect(reversing(true, 'lost')).toBe(false); // created wins → 'open', not reversing
  });
});
