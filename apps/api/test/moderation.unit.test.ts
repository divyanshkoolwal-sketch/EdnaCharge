/** @file apps/api/test/moderation.unit.test.ts. */
import { describe, expect, it } from 'vitest';
import { reviewReportResolutionStatus } from '../src/routers/moderation.js';

// These literals are load-bearing: the resolved status is written straight into
// ContentReport.status, guarded by the ContentReport_status_check CHECK
// constraint ('open'|'reviewed'|'dismissed'|'actioned'). The prior
// 'resolved_hidden' / 'resolved_no_action' violated the CHECK (23514) AFTER the
// review was already hidden, stranding a hidden review under a still-open report
// and 500ing the moderator. This pins the mapping so that regression can't recur.
const CHECK_ALLOWED = new Set(['open', 'reviewed', 'dismissed', 'actioned']);

describe('reviewReportResolutionStatus', () => {
  it('resolves a hide action to "actioned"', () => {
    expect(reviewReportResolutionStatus(true)).toBe('actioned');
  });

  it('resolves a no-action decision to "dismissed"', () => {
    expect(reviewReportResolutionStatus(false)).toBe('dismissed');
  });

  it('only ever returns a value the ContentReport status CHECK allows', () => {
    expect(CHECK_ALLOWED.has(reviewReportResolutionStatus(true))).toBe(true);
    expect(CHECK_ALLOWED.has(reviewReportResolutionStatus(false))).toBe(true);
  });
});
