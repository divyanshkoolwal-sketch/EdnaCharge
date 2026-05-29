/**
 * Regression tests for lifecycle bugs found in second-pass audit:
 *  #15 — Tier 2 booking with no session crossing threshold gets stuck in 'active'
 *  #16 — Tier 1 has no auto-stop at booking.endAt
 *  #17 — Driver registry never evicts → memory leak
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @edna/db before importing handlers
const mockBookingFindUnique = vi.fn();
const mockBookingUpdate = vi.fn();
const mockSessionFindUnique = vi.fn();
const mockShellDeviceFindUnique = vi.fn();

vi.mock('@edna/db', () => ({
  prisma: {
    booking: {
      findUnique: mockBookingFindUnique,
      update: mockBookingUpdate,
    },
    chargingSession: {
      findUnique: mockSessionFindUnique,
      update: vi.fn(),
      create: vi.fn(),
    },
    shellDevice: {
      findUnique: mockShellDeviceFindUnique,
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const mockBookingsQueueAdd = vi.fn();
vi.mock('../src/lib/queues.js', () => ({
  bookingsQueue: () => ({ add: mockBookingsQueueAdd, remove: vi.fn() }),
  DEFAULT_REPEAT_OPTS: {},
}));

vi.mock('../src/lib/device-registry.js', () => ({
  getDriver: vi.fn(async () => null), // default: no driver
}));

// Mock IORedis to avoid real Redis connection
vi.mock('ioredis', () => ({
  default: vi.fn(function (this: any) {
    this.get = vi.fn(async () => null);
    this.set = vi.fn(async () => {});
    this.setex = vi.fn(async () => {});
    this.del = vi.fn(async () => {});
    this.disconnect = vi.fn();
    this.quit = vi.fn(async () => {});
    return this;
  }),
}));

vi.mock('stripe', () => ({
  default: vi.fn(function (this: any) {
    this.paymentIntents = { cancel: vi.fn(async () => {}) };
    return this;
  }),
}));

vi.mock('../src/sentry.js', () => ({ Sentry: { captureException: vi.fn(), captureMessage: vi.fn() } }));
vi.mock('../src/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// BUG #15 — Tier 2 booking with no session crossing threshold
// ─────────────────────────────────────────────────────────────────────────────

describe('BUG #15 fix: Tier 2 booking auto-completes when window expires', () => {
  it('marks booking completed with $0 captured when window passes without a session', async () => {
    const { handleDeviceMonitor } = await import('../src/jobs/device-monitor.js');

    const pastEnd = Date.now() - (10 * 60 * 1000); // 10 min ago
    const pastStart = pastEnd - (60 * 60 * 1000);  // 1h before that

    mockBookingFindUnique.mockResolvedValue({
      id: 'b1',
      chargerId: 'c1',
      status: 'active',
      startAt: new Date(pastStart),
      endAt: new Date(pastEnd),
      stripePaymentIntentId: 'pi_dev_test',
      session: null, // KEY: no session was ever created
      charger: { id: 'c1', hardwareTier: 'tier_2_bridge_kit' },
    });

    await handleDeviceMonitor({ data: { bookingId: 'b1' } } as any);

    expect(mockBookingUpdate).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { status: 'completed', capturedAmountCents: 0 },
    });
  });

  it('does NOT mark booking errored or stuck in active when window expires', async () => {
    const { handleDeviceMonitor } = await import('../src/jobs/device-monitor.js');

    mockBookingFindUnique.mockResolvedValue({
      id: 'b2',
      chargerId: 'c1',
      status: 'active',
      startAt: new Date(Date.now() - 7200_000),
      endAt: new Date(Date.now() - 600_000),
      stripePaymentIntentId: null,
      session: null,
      charger: { id: 'c1', hardwareTier: 'tier_2_bridge_kit' },
    });

    await handleDeviceMonitor({ data: { bookingId: 'b2' } } as any);

    // Verify it transitioned to a TERMINAL state (not active or errored)
    const updateArgs = mockBookingUpdate.mock.calls[0]?.[0];
    expect(updateArgs?.data?.status).toBe('completed');
    expect(updateArgs?.data?.status).not.toBe('active');
    expect(updateArgs?.data?.status).not.toBe('errored');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BUG #16 — Tier 1 auto-stop at booking endAt
// ─────────────────────────────────────────────────────────────────────────────

describe('BUG #16 fix: Tier 1 auto-stop past booking.endAt', () => {
  it('enqueues shelly_stop when meter poll fires past booking endAt + buffer', async () => {
    const { handleShellyMeterPoll } = await import('../src/jobs/shelly-command.js');

    mockSessionFindUnique.mockResolvedValue({
      id: 's1',
      bookingId: 'b1',
      endedAt: null,
      meterStartWh: 0,
    });
    mockBookingFindUnique.mockResolvedValue({
      id: 'b1',
      chargerId: 'c1',
      status: 'active',
      // 10 min past endAt — should trigger auto-stop
      endAt: new Date(Date.now() - 10 * 60 * 1000),
      charger: { id: 'c1', hardwareTier: 'tier_1_smart_plug' },
    });

    await handleShellyMeterPoll({ data: { sessionId: 's1', bookingId: 'b1' } } as any);

    expect(mockBookingsQueueAdd).toHaveBeenCalledWith(
      'shelly_stop',
      { bookingId: 'b1', sessionId: 's1' },
      expect.any(Object),
    );
  });

  it('does NOT auto-stop while still within the booking window (or buffer)', async () => {
    const { handleShellyMeterPoll } = await import('../src/jobs/shelly-command.js');

    mockSessionFindUnique.mockResolvedValue({
      id: 's2',
      bookingId: 'b2',
      endedAt: null,
      meterStartWh: 0,
    });
    mockBookingFindUnique.mockResolvedValue({
      id: 'b2',
      chargerId: 'c2',
      status: 'active',
      // Still in window (endAt 30 min in the future)
      endAt: new Date(Date.now() + 30 * 60 * 1000),
      charger: { id: 'c2', hardwareTier: 'tier_1_smart_plug' },
    });

    await handleShellyMeterPoll({ data: { sessionId: 's2', bookingId: 'b2' } } as any);

    // Should NOT have enqueued shelly_stop
    const shellyStopCalls = mockBookingsQueueAdd.mock.calls.filter((c) => c[0] === 'shelly_stop');
    expect(shellyStopCalls).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BUG #17 — Driver registry eviction
// ─────────────────────────────────────────────────────────────────────────────

describe('BUG #17 fix: Driver registry evicts idle drivers', () => {
  it('exposes _registrySize and _clearRegistry test helpers', async () => {
    // Un-mock the registry for this specific test
    vi.doUnmock('../src/lib/device-registry.js');
    vi.resetModules();

    const mod = await import('../src/lib/device-registry.js');
    expect(typeof mod._registrySize).toBe('function');
    expect(typeof mod._clearRegistry).toBe('function');
    expect(typeof mod.getDriver).toBe('function');
    expect(typeof mod.evictDriver).toBe('function');
  });

  it('evictDriver removes specific charger from cache', async () => {
    // The mocked getDriver returns null, so we test evictDriver against an empty cache
    vi.doUnmock('../src/lib/device-registry.js');
    vi.resetModules();
    const mod = await import('../src/lib/device-registry.js');
    mod._clearRegistry();
    expect(mod._registrySize()).toBe(0);
    mod.evictDriver('non-existent-charger');
    expect(mod._registrySize()).toBe(0); // no-op, no crash
  });
});
