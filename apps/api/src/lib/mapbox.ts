/** @file apps/api/src/lib/mapbox.ts. */
import { TRPCError } from '@trpc/server';
import { createBreaker } from '@edna/server-utils';
import { logger } from '../logger.js';

type AddressInput = {
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
  lat: number;
  lng: number;
};

type Coordinate = { lat: number; lng: number };
export type RouteEstimate = { distanceM: number; durationSeconds: number };

const MAX_ADDRESS_DISTANCE_M = 250;

function metersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const lat1 = a.lat * rad;
  const lat2 = b.lat * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function token(): string | null {
  return process.env.MAPBOX_TOKEN ?? process.env.MAPBOX_ACCESS_TOKEN ?? null;
}

// Circuit breaker around Mapbox HTTP: a Mapbox outage/slowdown fails fast and
// self-heals instead of stacking slow requests on the API event loop. When open,
// `fire` rejects — geocoding surfaces SERVICE_UNAVAILABLE, route estimates fall
// back to null.
const mapboxBreaker = createBreaker((url: string): Promise<Response> => fetch(url), {
  name: 'mapbox',
  timeoutMs: 4000,
  errorThresholdPercentage: 50,
  resetTimeoutMs: 15_000,
  logger,
});

function mapboxFetch(url: string): Promise<Response> {
  return mapboxBreaker.fire(url);
}

export async function drivingRouteEstimate(
  origin: Coordinate,
  destination: Coordinate,
): Promise<RouteEstimate | null> {
  const accessToken = token();
  if (!accessToken) return null;
  const coords = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}` +
    `?overview=false&access_token=${encodeURIComponent(accessToken)}`;
  try {
    const res = await mapboxFetch(url);
    if (!res.ok) return null;
    const body = (await res.json()) as { routes?: Array<{ distance?: number; duration?: number }> };
    const route = body.routes?.[0];
    if (
      typeof route?.distance !== 'number' ||
      typeof route.duration !== 'number' ||
      !Number.isFinite(route.distance) ||
      !Number.isFinite(route.duration)
    ) {
      return null;
    }
    return { distanceM: route.distance, durationSeconds: route.duration };
  } catch {
    return null;
  }
}

/**
 * Straight-line (great-circle) ETA used as an experimental fallback when the live
 * Mapbox driving route is unavailable (no token / Mapbox down). Rough: assumes a
 * ~13.4 m/s (~30 mph) average urban speed. Gated behind ROUTE_ESTIMATE_V2 at the
 * call site so default behavior is unchanged.
 */
export function straightLineEstimate(origin: Coordinate, destination: Coordinate): RouteEstimate {
  const distanceM = metersBetween(origin, destination);
  return { distanceM, durationSeconds: Math.round(distanceM / 13.4) };
}

export async function validateAddressPin(input: AddressInput): Promise<void> {
  const accessToken = token();
  if (!accessToken) {
    if (process.env.NODE_ENV === 'production') {
      throw new TRPCError({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Mapbox token is required before publishing chargers.',
      });
    }
    return;
  }

  const address = [
    input.addressLine1,
    input.city,
    input.state,
    input.postalCode,
    input.country ?? 'US',
  ].join(', ');
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json` +
    `?limit=1&country=${encodeURIComponent(input.country ?? 'US')}&access_token=${encodeURIComponent(accessToken)}`;
  let res: Response;
  try {
    res = await mapboxFetch(url);
  } catch {
    // Breaker open or network failure — treat as a transient dependency outage.
    throw new TRPCError({
      code: 'SERVICE_UNAVAILABLE',
      message: 'Address validation is temporarily unavailable.',
    });
  }
  if (!res.ok) {
    throw new TRPCError({
      code: 'SERVICE_UNAVAILABLE',
      message: 'Address validation is temporarily unavailable.',
    });
  }
  const body = (await res.json()) as { features?: Array<{ center?: [number, number] }> };
  const center = body.features?.[0]?.center;
  if (!center) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'We could not verify that charger address.',
    });
  }
  const distanceM = metersBetween(input, { lng: center[0], lat: center[1] });
  if (distanceM > MAX_ADDRESS_DISTANCE_M) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Move the map pin closer to the verified address.',
    });
  }
}
