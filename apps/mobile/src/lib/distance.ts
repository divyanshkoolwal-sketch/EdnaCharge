// Pure-JS Haversine + a rough drive-time formatter. We deliberately avoid an
// extra Mapbox Directions API call — a 30 km/h average gives a "good enough"
// ETA for the demo. Swap in a real router later if the demo audience cares
// about minute-level accuracy.

const EARTH_KM = 6371;

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_KM * c;
}

export function formatDistanceAndDriveTime(km: number): string {
  const driveMin = Math.max(1, Math.round((km / 30) * 60)); // 30 km/h average
  if (km < 1) {
    return `${Math.round(km * 1000)} m · ${driveMin} min drive`;
  }
  if (km < 10) {
    return `${km.toFixed(1)} km · ${driveMin} min drive`;
  }
  return `${Math.round(km)} km · ${driveMin} min drive`;
}
