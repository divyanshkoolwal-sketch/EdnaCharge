/** @file apps/api/test/access.unit.test.ts. */
import { describe, expect, it } from 'vitest';
import { JoinAppWaitlistInputZ } from '@edna/schemas';
import { hashInviteCode, normalizeInviteCode } from '../src/lib/access.js';

describe('invite code normalization', () => {
  it('uppercases and ignores spaces and hyphens', () => {
    expect(normalizeInviteCode(' fremont-host 12-34 ')).toBe('FREMONTHOST1234');
  });

  it('hashes equivalent typed forms to the same value', () => {
    expect(hashInviteCode('FREMONT-HOST-1234')).toBe(hashInviteCode('fremont host 1234'));
  });
});

describe('app waitlist input', () => {
  it('rejects whitespace-only location fields', () => {
    expect(() =>
      JoinAppWaitlistInputZ.parse({ role: 'host', city: '   ', postalCode: '94538' }),
    ).toThrow();
    expect(() =>
      JoinAppWaitlistInputZ.parse({ role: 'host', city: 'Fremont', postalCode: '   ' }),
    ).toThrow();
  });

  it('trims optional host lead fields before persistence', () => {
    const parsed = JoinAppWaitlistInputZ.parse({
      role: 'host',
      city: ' Fremont ',
      postalCode: ' 94538 ',
      phone: ' 555-0100 ',
      chargerBrand: ' Wallbox ',
      notes: ' Has driveway access ',
    });
    expect(parsed).toMatchObject({
      city: 'Fremont',
      postalCode: '94538',
      phone: '555-0100',
      chargerBrand: 'Wallbox',
      notes: 'Has driveway access',
    });
  });
});
