/** @file apps/api/test/auto-decline.unit.test.ts. */
import { describe, it, expect } from 'vitest';
import { autoDeclineJobId } from '../src/lib/auto-decline.js';

describe('auto_decline jobId convention', () => {
  it('uses the same queue job id for schedule and cancellation', () => {
    expect(autoDeclineJobId('booking-123')).toBe('auto_decline_booking-123');
  });
});
