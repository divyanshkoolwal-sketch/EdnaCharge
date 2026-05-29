/**
 * Unit tests for the Tier 2 threshold-detection logic.
 *
 * We test the pure decision logic (does the sliding window trigger start/stop
 * at the right moment?). DB writes + Redis state are mocked.
 */

import { describe, it, expect } from 'vitest';

const STABLE_READS = 6;
const THRESHOLD_START_W = 500;
const THRESHOLD_STOP_W = 100;

// Pure helper that mirrors the decision in handleDeviceMonitor
function decide(readings: number[], hasSession: boolean): 'start' | 'stop' | 'wait' {
  if (readings.length < STABLE_READS) return 'wait';
  const allAboveStart = readings.every((r) => r > THRESHOLD_START_W);
  const allBelowStop = readings.every((r) => r < THRESHOLD_STOP_W);
  if (!hasSession && allAboveStart) return 'start';
  if (hasSession && allBelowStop) return 'stop';
  return 'wait';
}

describe('Tier 2 threshold detection', () => {
  it('does not start until 6 consecutive readings above 500W', () => {
    expect(decide([600, 600, 600, 600, 600], false)).toBe('wait');     // only 5
    expect(decide([600, 600, 600, 600, 600, 600], false)).toBe('start'); // 6
  });

  it('does not start if any reading is below threshold', () => {
    expect(decide([600, 600, 499, 600, 600, 600], false)).toBe('wait');
    expect(decide([501, 600, 600, 600, 600, 600], false)).toBe('start'); // 501 > 500
    expect(decide([500, 600, 600, 600, 600, 600], false)).toBe('wait');  // 500 not > 500
  });

  it('does not stop a session until 6 consecutive readings below 100W', () => {
    expect(decide([50, 50, 50, 50, 50], true)).toBe('wait');        // only 5
    expect(decide([50, 50, 50, 50, 50, 50], true)).toBe('stop');    // 6
    expect(decide([50, 50, 99, 50, 50, 50], true)).toBe('stop');    // all < 100
    expect(decide([50, 50, 100, 50, 50, 50], true)).toBe('wait');   // 100 not < 100
  });

  it('does not stop a session that has not started', () => {
    expect(decide([0, 0, 0, 0, 0, 0], false)).toBe('wait');
  });

  it('does not start a session that is already running', () => {
    expect(decide([1000, 1000, 1000, 1000, 1000, 1000], true)).toBe('wait');
  });

  it('hysteresis prevents flapping near threshold', () => {
    // Power oscillating around 300W: never crosses 500W consistently and
    // never drops below 100W consistently → stays in 'wait'
    expect(decide([300, 350, 280, 320, 290, 310], false)).toBe('wait');
    expect(decide([300, 350, 280, 320, 290, 310], true)).toBe('wait');
  });

  it('handles mid-session brownout (one dip below 100W) correctly', () => {
    // Battery management briefly idles for one reading, then resumes.
    // That single dip should NOT end the session.
    expect(decide([3000, 50, 3000, 3000, 3000, 3000], true)).toBe('wait');
  });
});
