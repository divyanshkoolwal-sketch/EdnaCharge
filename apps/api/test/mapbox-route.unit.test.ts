/** @file apps/api/test/mapbox-route.unit.test.ts. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { drivingRouteEstimate } from '../src/lib/mapbox.js';

const originalMapboxToken = process.env.MAPBOX_TOKEN;
const originalMapboxAccessToken = process.env.MAPBOX_ACCESS_TOKEN;
type FetchMock = (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>;

function restoreEnv(name: 'MAPBOX_TOKEN' | 'MAPBOX_ACCESS_TOKEN', value: string | undefined): void {
  if (value == null) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('drivingRouteEstimate', () => {
  afterEach(() => {
    restoreEnv('MAPBOX_TOKEN', originalMapboxToken);
    restoreEnv('MAPBOX_ACCESS_TOKEN', originalMapboxAccessToken);
    vi.unstubAllGlobals();
  });

  it('returns null without a server Mapbox token', async () => {
    delete process.env.MAPBOX_TOKEN;
    delete process.env.MAPBOX_ACCESS_TOKEN;
    const fetchMock = vi.fn<FetchMock>(async (..._args) => jsonResponse({ routes: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      drivingRouteEstimate({ lat: 37, lng: -122 }, { lat: 38, lng: -121 }),
    ).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('parses distance and duration from Mapbox Directions', async () => {
    process.env.MAPBOX_TOKEN = 'server-token';
    const fetchMock = vi.fn<FetchMock>(async (..._args) =>
      jsonResponse({ routes: [{ distance: 1609.34, duration: 420 }] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      drivingRouteEstimate({ lat: 37, lng: -122 }, { lat: 38, lng: -121 }),
    ).resolves.toEqual({ distanceM: 1609.34, durationSeconds: 420 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0] ?? '')).toContain(
      '/directions/v5/mapbox/driving/-122,37;-121,38',
    );
  });

  it('returns null for non-routable or failed Mapbox responses', async () => {
    process.env.MAPBOX_TOKEN = 'server-token';
    const failures = [
      async () => jsonResponse({ message: 'bad' }, 500),
      async () => jsonResponse({ routes: [] }),
      async () => {
        throw new Error('network');
      },
    ];

    for (const failure of failures) {
      vi.stubGlobal('fetch', vi.fn<FetchMock>(async (..._args) => failure()));
      await expect(
        drivingRouteEstimate({ lat: 37, lng: -122 }, { lat: 38, lng: -121 }),
      ).resolves.toBeNull();
    }
  });
});
