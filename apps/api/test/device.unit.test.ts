/**
 * Pure logic tests for apps/api/src/routers/device.ts.
 * No live DB or broker required.
 */

import { describe, it, expect } from 'vitest';
import { RegisterDeviceInputZ, HardwareModelZ, DeviceStatusZ } from '@edna/schemas';

describe('Device input schemas', () => {
  it('accepts valid registration input', () => {
    expect(() =>
      RegisterDeviceInputZ.parse({
        chargerId: '550e8400-e29b-41d4-a716-446655440000',
        shellyDeviceId: 'shellyplus-plug-abc123',
        mac: 'AA:BB:CC:DD:EE:FF',
        hardwareModel: 'shelly-plus-plug-s',
      }),
    ).not.toThrow();
  });

  it('rejects invalid MAC formats', () => {
    const cases = [
      'AABBCCDDEEFF',          // no separators
      'AA-BB-CC-DD-EE-FF',     // hyphens (must normalize before send)
      'AA:BB:CC:DD:EE',        // too short
      'GG:HH:II:JJ:KK:LL',     // non-hex
      '',
    ];
    for (const mac of cases) {
      expect(() =>
        RegisterDeviceInputZ.parse({
          chargerId: '550e8400-e29b-41d4-a716-446655440000',
          shellyDeviceId: 'x',
          mac,
          hardwareModel: 'shelly-plus-plug-s',
        }),
      ).toThrow();
    }
  });

  it('rejects unknown hardware models', () => {
    expect(() =>
      RegisterDeviceInputZ.parse({
        chargerId: '550e8400-e29b-41d4-a716-446655440000',
        shellyDeviceId: 'x',
        mac: 'AA:BB:CC:DD:EE:FF',
        hardwareModel: 'tesla-wall-connector', // not in our supported list
      }),
    ).toThrow();
  });

  it('rejects non-UUID chargerId', () => {
    expect(() =>
      RegisterDeviceInputZ.parse({
        chargerId: 'not-a-uuid',
        shellyDeviceId: 'x',
        mac: 'AA:BB:CC:DD:EE:FF',
        hardwareModel: 'shelly-plus-plug-s',
      }),
    ).toThrow();
  });

  it('HardwareModel enum matches the two supported devices', () => {
    expect(HardwareModelZ.options.sort()).toEqual(
      ['shelly-plus-plug-s', 'shelly-pro-em-50'].sort(),
    );
  });

  it('DeviceStatus enum matches Prisma enum values', () => {
    expect(DeviceStatusZ.options.sort()).toEqual(
      ['active', 'error', 'offline', 'provisioned'].sort(),
    );
  });

  it('shellyDeviceId is bounded (no DOS via huge strings)', () => {
    expect(() =>
      RegisterDeviceInputZ.parse({
        chargerId: '550e8400-e29b-41d4-a716-446655440000',
        shellyDeviceId: 'x'.repeat(65), // > 64 char limit
        mac: 'AA:BB:CC:DD:EE:FF',
        hardwareModel: 'shelly-plus-plug-s',
      }),
    ).toThrow();
  });

  it('accepts shellyDeviceId at upper bound (64 chars)', () => {
    expect(() =>
      RegisterDeviceInputZ.parse({
        chargerId: '550e8400-e29b-41d4-a716-446655440000',
        shellyDeviceId: 'x'.repeat(64),
        mac: 'AA:BB:CC:DD:EE:FF',
        hardwareModel: 'shelly-plus-plug-s',
      }),
    ).not.toThrow();
  });
});

describe('Broker URL parsing', () => {
  // Mirror the parseBrokerUrl logic to test it directly without importing
  // the API router (which pulls Prisma + everything)
  function parseBrokerUrl(url: string): { host: string; port: number; useSsl: boolean } {
    const useSsl = url.startsWith('mqtts://');
    const stripped = url.replace(/^mqtt[s]?:\/\//, '');
    const [host, portStr] = stripped.split(':');
    const port = portStr ? Number(portStr) : useSsl ? 8883 : 1883;
    return { host: host ?? 'localhost', port, useSsl };
  }

  it('parses plain mqtt:// URLs', () => {
    expect(parseBrokerUrl('mqtt://broker.edna.com:1883')).toEqual({
      host: 'broker.edna.com',
      port: 1883,
      useSsl: false,
    });
  });

  it('parses mqtts:// URLs with TLS port', () => {
    expect(parseBrokerUrl('mqtts://broker.edna.com:8883')).toEqual({
      host: 'broker.edna.com',
      port: 8883,
      useSsl: true,
    });
  });

  it('defaults to port 1883 for plain mqtt:// without explicit port', () => {
    expect(parseBrokerUrl('mqtt://broker.edna.com')).toEqual({
      host: 'broker.edna.com',
      port: 1883,
      useSsl: false,
    });
  });

  it('defaults to port 8883 for mqtts:// without explicit port', () => {
    expect(parseBrokerUrl('mqtts://broker.edna.com')).toEqual({
      host: 'broker.edna.com',
      port: 8883,
      useSsl: true,
    });
  });

  it('handles localhost dev URL', () => {
    expect(parseBrokerUrl('mqtt://localhost:1883')).toEqual({
      host: 'localhost',
      port: 1883,
      useSsl: false,
    });
  });
});
