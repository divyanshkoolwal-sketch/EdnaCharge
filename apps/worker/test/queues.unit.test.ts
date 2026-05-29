/**
 * Verify the singleton queue pattern: bookingsQueue() returns the same Queue
 * instance across calls (no connection leak).
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('bullmq', () => {
  let queueInstanceCount = 0;
  return {
    Queue: vi.fn(function (this: any, name: string) {
      this.name = name;
      this.id = ++queueInstanceCount;
      this.close = vi.fn(async () => {});
      return this;
    }),
    __getQueueCount: () => queueInstanceCount,
    __reset: () => { queueInstanceCount = 0; },
  };
});
vi.mock('ioredis', () => {
  let connCount = 0;
  return {
    default: vi.fn(function (this: any) {
      this.id = ++connCount;
      this.quit = vi.fn(async () => {});
      return this;
    }),
    __getConnCount: () => connCount,
  };
});

const bullmq = await import('bullmq') as any;

describe('queues singleton', () => {
  it('returns the SAME queue instance across multiple calls', async () => {
    const { bookingsQueue } = await import('../src/lib/queues.js');
    const q1 = bookingsQueue();
    const q2 = bookingsQueue();
    const q3 = bookingsQueue();

    expect(q1).toBe(q2);
    expect(q2).toBe(q3);
    expect(bullmq.__getQueueCount()).toBe(1);
  });

  it('DEFAULT_REPEAT_OPTS keeps Redis bounded', async () => {
    const { DEFAULT_REPEAT_OPTS } = await import('../src/lib/queues.js');
    expect(DEFAULT_REPEAT_OPTS).toMatchObject({
      removeOnComplete: { age: expect.any(Number), count: expect.any(Number) },
      removeOnFail: { age: expect.any(Number), count: expect.any(Number) },
    });
    // Completed jobs evicted within 1 hour (3600s)
    expect(DEFAULT_REPEAT_OPTS.removeOnComplete.age).toBeLessThanOrEqual(3600);
    // Failed jobs kept for at most 1 day for diagnostics
    expect(DEFAULT_REPEAT_OPTS.removeOnFail.age).toBeLessThanOrEqual(86400);
  });
});
