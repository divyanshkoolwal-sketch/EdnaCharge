/**
 * Tests for the sign-up password policy: 12-char minimum + HaveIBeenPwned
 * k-anonymity breach screening (fail-open).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { digestMock } = vi.hoisted(() => ({ digestMock: vi.fn() }));

vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA1: 'SHA-1' },
  digestStringAsync: digestMock,
}));

import {
  passwordPolicyError,
  isBreachedPassword,
  validateNewPassword,
  MIN_PASSWORD_LENGTH,
} from '../src/lib/passwordPolicy';

describe('passwordPolicyError (offline)', () => {
  it('rejects passwords shorter than the minimum', () => {
    expect(passwordPolicyError('short')).toMatch(/at least 12/i);
    expect(passwordPolicyError('a'.repeat(MIN_PASSWORD_LENGTH - 1))).not.toBeNull();
  });
  it('accepts a 12+ char varied password', () => {
    expect(passwordPolicyError('correct horse battery')).toBeNull();
  });
  it('rejects all-same-char and whitespace-only', () => {
    expect(passwordPolicyError('aaaaaaaaaaaa')).not.toBeNull();
    expect(passwordPolicyError('            ')).not.toBeNull();
  });
});

describe('isBreachedPassword (HIBP k-anonymity)', () => {
  // SHA1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
  const SHA1_PASSWORD = '5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8';
  beforeEach(() => {
    digestMock.mockReset();
    digestMock.mockResolvedValue(SHA1_PASSWORD);
  });

  it('only sends the first 5 hash chars and detects a breached suffix', async () => {
    const calls: string[] = [];
    (global as any).fetch = vi.fn(async (url: string) => {
      calls.push(url);
      // Response must contain the suffix (hash minus first 5) with count > 0.
      const suffix = SHA1_PASSWORD.slice(5);
      return { ok: true, text: async () => `00000000000000000000000000000000000:0\n${suffix}:42` } as any;
    });
    const breached = await isBreachedPassword('password');
    expect(breached).toBe(true);
    expect(calls[0]).toBe(`https://api.pwnedpasswords.com/range/${SHA1_PASSWORD.slice(0, 5)}`);
    expect(calls[0]).not.toContain(SHA1_PASSWORD.slice(5)); // suffix never leaves the device
  });

  it('returns false when the suffix is absent', async () => {
    (global as any).fetch = vi.fn(async () => ({ ok: true, text: async () => 'DEADBEEF:5' }) as any);
    expect(await isBreachedPassword('password')).toBe(false);
  });

  it('fails OPEN on network/API error (never blocks sign-up)', async () => {
    (global as any).fetch = vi.fn(async () => {
      throw new Error('offline');
    });
    expect(await isBreachedPassword('password')).toBe(false);
  });
});

describe('validateNewPassword', () => {
  beforeEach(() => {
    digestMock.mockResolvedValue('5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8');
  });
  it('returns the policy error before doing any network call', async () => {
    (global as any).fetch = vi.fn();
    expect(await validateNewPassword('tooshort')).toMatch(/at least 12/i);
    expect((global as any).fetch).not.toHaveBeenCalled();
  });
  it('returns a breach message for a long-but-breached password', async () => {
    (global as any).fetch = vi.fn(async () => ({ ok: true, text: async () => `${'5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8'.slice(5)}:99` }) as any);
    expect(await validateNewPassword('passwordpassword')).toMatch(/data breach/i);
  });
  it('returns null for a long, non-breached password', async () => {
    (global as any).fetch = vi.fn(async () => ({ ok: true, text: async () => 'NOMATCH:1' }) as any);
    expect(await validateNewPassword('a-very-unique-passphrase-2026')).toBeNull();
  });
});
