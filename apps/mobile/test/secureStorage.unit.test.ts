/**
 * Tests for the keychain-backed AsyncStorage shim used by Firebase JS Auth
 * persistence: key sanitization, chunking past the SecureStore size cap,
 * one-time AsyncStorage→SecureStore migration, and fail-safe reads.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { secureMap, asyncMap, throwOnGet } = vi.hoisted(() => ({
  secureMap: new Map<string, string>(),
  asyncMap: new Map<string, string>(),
  throwOnGet: { value: false },
}));

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (k: string) => {
    if (throwOnGet.value) throw new Error('keychain locked');
    return secureMap.has(k) ? secureMap.get(k)! : null;
  }),
  setItemAsync: vi.fn(async (k: string, v: string) => {
    secureMap.set(k, v);
  }),
  deleteItemAsync: vi.fn(async (k: string) => {
    secureMap.delete(k);
  }),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (k: string) => (asyncMap.has(k) ? asyncMap.get(k)! : null)),
    removeItem: vi.fn(async (k: string) => {
      asyncMap.delete(k);
    }),
  },
}));

import { secureAsyncStorage, safeKey } from '../src/lib/secureStorage';

beforeEach(() => {
  secureMap.clear();
  asyncMap.clear();
  throwOnGet.value = false;
});

describe('safeKey', () => {
  it('strips SecureStore-illegal characters (e.g. ":")', () => {
    const k = safeKey('firebase:authUser:apiKey:[DEFAULT]');
    expect(k).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(k).not.toContain(':');
  });
  it('is deterministic and distinguishes distinct keys', () => {
    expect(safeKey('a:b')).toBe(safeKey('a:b'));
    expect(safeKey('a:b')).not.toBe(safeKey('a:c'));
  });
});

describe('round-trip + chunking', () => {
  it('stores and retrieves a small value', async () => {
    await secureAsyncStorage.setItem('firebase:authUser:x', 'hello');
    expect(await secureAsyncStorage.getItem('firebase:authUser:x')).toBe('hello');
  });

  it('chunks a value larger than the SecureStore cap and reassembles it', async () => {
    const big = 'x'.repeat(5000); // > CHUNK_SIZE (1800)
    await secureAsyncStorage.setItem('k', big);
    // More than one chunk key must exist.
    const chunkKeys = [...secureMap.keys()].filter((k) => /__\d+$/.test(k));
    expect(chunkKeys.length).toBeGreaterThan(1);
    expect(await secureAsyncStorage.getItem('k')).toBe(big);
  });

  it('removeItem clears all chunks + header', async () => {
    await secureAsyncStorage.setItem('k', 'y'.repeat(4000));
    await secureAsyncStorage.removeItem('k');
    expect(await secureAsyncStorage.getItem('k')).toBeNull();
    expect(secureMap.size).toBe(0);
  });

  it('overwriting a long value with a short one leaves no stale chunks', async () => {
    await secureAsyncStorage.setItem('k', 'z'.repeat(6000));
    await secureAsyncStorage.setItem('k', 'tiny');
    expect(await secureAsyncStorage.getItem('k')).toBe('tiny');
  });
});

describe('one-time migration from AsyncStorage', () => {
  it('moves a legacy plaintext value into SecureStore and wipes the original', async () => {
    asyncMap.set('firebase:authUser:legacy', 'old-session');
    const got = await secureAsyncStorage.getItem('firebase:authUser:legacy');
    expect(got).toBe('old-session');
    // Plaintext copy gone…
    expect(asyncMap.has('firebase:authUser:legacy')).toBe(false);
    // …and now served from SecureStore on the next read (no AsyncStorage needed).
    expect(await secureAsyncStorage.getItem('firebase:authUser:legacy')).toBe('old-session');
  });
});

describe('fail-safe', () => {
  it('returns null (not throw) when the keychain read fails', async () => {
    throwOnGet.value = true;
    expect(await secureAsyncStorage.getItem('anything')).toBeNull();
  });
});
