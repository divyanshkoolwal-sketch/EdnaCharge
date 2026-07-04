/** @file apps/api/test/env.unit.test.ts. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isLocalRedisUrl, loadEnv } from '@edna/config/env';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('production Redis validation', () => {
  it('detects loopback Redis hosts beyond literal localhost', () => {
    expect(isLocalRedisUrl('redis://localhost:6379')).toBe(true);
    expect(isLocalRedisUrl('redis://127.0.0.1:6379')).toBe(true);
    expect(isLocalRedisUrl('redis://127.42.0.1:6379')).toBe(true);
    expect(isLocalRedisUrl('redis://[::1]:6379')).toBe(true);
    expect(isLocalRedisUrl('rediss://cache.example.com:6380')).toBe(false);
  });

  it('rejects 127.0.0.1 in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATABASE_URL', 'postgresql://postgres:postgres@example.com:5432/postgres');
    vi.stubEnv('REDIS_URL', 'redis://127.0.0.1:6379');

    expect(() => loadEnv()).toThrow(/REDIS_URL must be set to a non-local Redis endpoint/);
  });
});
