/** Types and GeoJSON helpers for the driver charger map. */
export type Coordinate = [number, number];
export type PointGeometry = { type: 'Point'; coordinates: number[] };
type AnyGeometry = { type: string; coordinates?: unknown; geometries?: unknown };
export type MapFeature<
  GeometryT extends { type: string } = AnyGeometry,
  PropertiesT extends Record<string, unknown> = Record<string, unknown>,
> = {
  type: 'Feature';
  id?: string | number;
  properties: PropertiesT | null;
  geometry: GeometryT;
};
export type MapFeatureCollection<
  GeometryT extends { type: string } = PointGeometry,
  PropertiesT extends Record<string, unknown> = Record<string, unknown>,
> = {
  type: 'FeatureCollection';
  features: Array<MapFeature<GeometryT, PropertiesT>>;
};

export type Charger = {
  id: string;
  title: string;
  photoUrl: string | null;
  lat: number;
  lng: number;
  connectorType: string;
  powerKw: number;
  pricePerKwhCents: number | null;
  pricePerHourCents: number | null;
  status: string;
  distanceM: number;
};

export const TRI_VALLEY: Coordinate = [-121.8747, 37.6819];
export const MAP_STYLES = {
  light: 'mapbox://styles/mapbox/streets-v12',
  dark: 'mapbox://styles/mapbox/dark-v11',
};

type ChargerFeatureProperties = {
  id: string;
  title: string;
  status: string;
  available: boolean;
};

export function chargerFeatures(chargers: Charger[]): MapFeatureCollection<PointGeometry, ChargerFeatureProperties> {
  return {
    type: 'FeatureCollection',
    features: chargers.map<MapFeature<PointGeometry, ChargerFeatureProperties>>((c) => ({
      type: 'Feature',
      id: c.id,
      properties: {
        id: c.id,
        title: c.title,
        status: c.status,
        available: c.status === 'available',
      },
      geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
    })),
  };
}
