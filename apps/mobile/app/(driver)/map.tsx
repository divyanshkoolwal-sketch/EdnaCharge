import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import Mapbox, {
  MapView,
  Camera,
  ShapeSource,
  SymbolLayer,
  CircleLayer,
  UserLocation,
  type MapState,
} from '@rnmapbox/maps';
import type { CameraRef } from '@rnmapbox/maps/lib/typescript/src/components/Camera';
import type { FeatureCollection, Feature, Point, Geometry } from 'geojson';
import { trpc } from '../../src/lib/trpc';

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';

// One-time SDK init — must run before the first render of MapView.
Mapbox.setAccessToken(MAPBOX_TOKEN);
Mapbox.setTelemetryEnabled(false); // privacy-first; opt-in only

type Charger = {
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

const TRI_VALLEY: [number, number] = [-121.8747, 37.6819]; // [lng, lat]
const STYLES = {
  light: 'mapbox://styles/mapbox/streets-v12',
  dark: 'mapbox://styles/mapbox/dark-v11',
};

export default function Map() {
  const router = useRouter();
  const scheme = useColorScheme();
  const cameraRef = useRef<CameraRef>(null);
  const sourceRef = useRef<ShapeSource | null>(null);

  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [searchCenter, setSearchCenter] = useState<[number, number]>(TRI_VALLEY);
  const [viewCenter, setViewCenter] = useState<[number, number]>(TRI_VALLEY);
  const [showSearchHere, setShowSearchHere] = useState(false);
  const [styleLoaded, setStyleLoaded] = useState(false);

  // Foreground location permission. We ask once; failure leaves the camera
  // at the Tri-Valley default rather than blocking the screen.
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const c: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        setUserPos(c);
        setSearchCenter(c);
        cameraRef.current?.setCamera({
          centerCoordinate: c,
          zoomLevel: 13,
          animationDuration: 600,
        });
      } catch {
        // GPS off / fix not yet — Tri-Valley default is fine.
      }
    })();
  }, []);

  const nearby = trpc.charger.nearby.useQuery({
    lat: searchCenter[1],
    lng: searchCenter[0],
    radiusMeters: 25_000,
  });

  const features: FeatureCollection<Point> = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: (nearby.data ?? []).map<Feature<Point>>((c: Charger) => ({
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
    }),
    [nearby.data],
  );

  const onMapIdle = useCallback(
    (state: MapState) => {
      const c = state.properties.center as [number, number] | undefined;
      if (!c) return;
      setViewCenter(c);
      // Show "Search this area" when the camera has drifted >1km from the last
      // search center. Avoids flicker on tiny pans.
      const dx = c[0] - searchCenter[0];
      const dy = c[1] - searchCenter[1];
      const km = Math.sqrt(dx * dx + dy * dy) * 111; // rough deg→km
      setShowSearchHere(km > 1);
    },
    [searchCenter],
  );

  const onPressFeature = useCallback(
    async (e: { features: Feature<Geometry>[] }) => {
      const f = e.features[0];
      if (!f || f.geometry.type !== 'Point') return;
      const props = (f.properties ?? {}) as Record<string, unknown>;
      // Cluster: zoom in to expand it.
      if (props.cluster) {
        const cluster = f as Feature<Point> & {
          properties: { cluster_id: number; point_count: number };
        };
        try {
          const zoom = await sourceRef.current?.getClusterExpansionZoom(cluster);
          const coords = cluster.geometry.coordinates as [number, number];
          cameraRef.current?.setCamera({
            centerCoordinate: coords,
            zoomLevel: typeof zoom === 'number' ? zoom + 0.2 : 14,
            animationDuration: 350,
          });
        } catch {
          // best-effort; ignore
        }
        return;
      }
      const id = typeof props.id === 'string' ? props.id : undefined;
      if (id) router.push({ pathname: '/(driver)/charger/[id]', params: { id } });
    },
    [router],
  );

  const recenter = useCallback(() => {
    if (!userPos) {
      Alert.alert(
        'Location off',
        'Turn on location in Settings to recenter the map on you.',
      );
      return;
    }
    cameraRef.current?.setCamera({
      centerCoordinate: userPos,
      zoomLevel: 13,
      animationDuration: 600,
    });
    setSearchCenter(userPos);
    setShowSearchHere(false);
  }, [userPos]);

  const searchHere = useCallback(() => {
    setSearchCenter(viewCenter);
    setShowSearchHere(false);
  }, [viewCenter]);

  if (!MAPBOX_TOKEN) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <Text className="text-center text-gray-700 px-8">
          Map is misconfigured: EXPO_PUBLIC_MAPBOX_TOKEN is missing.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <MapView
        style={{ flex: 1 }}
        styleURL={scheme === 'dark' ? STYLES.dark : STYLES.light}
        compassEnabled
        scaleBarEnabled={false}
        attributionPosition={{ bottom: 8, right: 8 }}
        logoEnabled
        onDidFinishLoadingStyle={() => setStyleLoaded(true)}
        onMapIdle={onMapIdle}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{ centerCoordinate: TRI_VALLEY, zoomLevel: 11 }}
          animationDuration={0}
        />
        {userPos ? (
          <UserLocation visible androidRenderMode="normal" showsUserHeadingIndicator />
        ) : null}
        {styleLoaded ? (
          <ShapeSource
            ref={(r) => {
              sourceRef.current = r;
            }}
            id="chargers"
            cluster
            clusterRadius={50}
            clusterMaxZoomLevel={14}
            shape={features}
            onPress={onPressFeature}
          >
            {/* Cluster bubbles */}
            <CircleLayer
              id="charger-clusters"
              filter={['has', 'point_count']}
              style={{
                circleColor: scheme === 'dark' ? '#0EA5E9' : '#000000',
                circleStrokeColor: '#FFFFFF',
                circleStrokeWidth: 2,
                circleRadius: ['step', ['get', 'point_count'], 18, 10, 24, 25, 30, 50, 36],
                circleOpacity: 0.95,
              }}
            />
            <SymbolLayer
              id="charger-cluster-count"
              filter={['has', 'point_count']}
              style={{
                textField: ['get', 'point_count_abbreviated'],
                textColor: '#FFFFFF',
                textSize: 14,
                textFont: ['Open Sans Bold', 'Arial Unicode MS Bold'],
                textAllowOverlap: true,
                textIgnorePlacement: true,
              }}
            />
            {/* Individual pins */}
            <CircleLayer
              id="charger-pin-bg"
              filter={['!', ['has', 'point_count']]}
              style={{
                circleColor: [
                  'case',
                  ['==', ['get', 'available'], true],
                  '#10B981', // emerald — available
                  '#9CA3AF', // gray — unavailable
                ],
                circleRadius: 16,
                circleStrokeColor: '#FFFFFF',
                circleStrokeWidth: 3,
              }}
            />
            <SymbolLayer
              id="charger-pin-icon"
              filter={['!', ['has', 'point_count']]}
              style={{
                textField: '⚡',
                textColor: '#FFFFFF',
                textSize: 14,
                textAllowOverlap: true,
                textIgnorePlacement: true,
              }}
            />
          </ShapeSource>
        ) : null}
      </MapView>

      {nearby.isFetching && (
        <View className="absolute top-16 right-4 bg-white/90 rounded-full p-2 shadow">
          <ActivityIndicator />
        </View>
      )}

      <Pressable
        onPress={recenter}
        accessibilityLabel="Recenter map on me"
        className="absolute bottom-32 right-4 bg-white rounded-full w-12 h-12 items-center justify-center shadow-md"
      >
        <Text style={{ fontSize: 22 }}>📍</Text>
      </Pressable>

      {showSearchHere && (
        <Pressable
          onPress={searchHere}
          className="absolute bottom-8 self-center bg-black rounded-full px-6 py-3 shadow-lg"
        >
          <Text className="text-white font-medium">Search this area</Text>
        </Pressable>
      )}

      {styleLoaded && !nearby.isFetching && (nearby.data?.length ?? 0) === 0 && (
        <View className="absolute top-1/2 self-center bg-white/95 rounded-2xl px-5 py-3 shadow">
          <Text className="text-gray-700">No chargers in this area.</Text>
        </View>
      )}
    </View>
  );
}
