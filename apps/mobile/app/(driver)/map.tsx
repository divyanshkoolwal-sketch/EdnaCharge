// Driver map — Mapbox-rendered with the design's overlay chrome (search bar,
// search-this-area pill, recenter FAB).
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, Text, ActivityIndicator, Alert, useColorScheme } from 'react-native';
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
import { useTheme } from '../../src/theme/useTheme';
import { Search, Recenter, Bolt } from '../../src/components/icons/Icon';
import { IconCircle } from '../../src/components/ui';

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';

Mapbox.setAccessToken(MAPBOX_TOKEN);
Mapbox.setTelemetryEnabled(false);

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

const TRI_VALLEY: [number, number] = [-121.8747, 37.6819];
const STYLES = {
  light: 'mapbox://styles/mapbox/streets-v12',
  dark: 'mapbox://styles/mapbox/dark-v11',
};

export default function Map() {
  const router = useRouter();
  const scheme = useColorScheme();
  const theme = useTheme();
  const cameraRef = useRef<CameraRef>(null);
  const sourceRef = useRef<ShapeSource | null>(null);

  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [searchCenter, setSearchCenter] = useState<[number, number]>(TRI_VALLEY);
  const [viewCenter, setViewCenter] = useState<[number, number]>(TRI_VALLEY);
  const [showSearchHere, setShowSearchHere] = useState(false);
  const [styleLoaded, setStyleLoaded] = useState(false);
  const [locationLabel, setLocationLabel] = useState('Tri-Valley');

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
        // Best-effort reverse geocode label for the search bar.
        try {
          const res = await Location.reverseGeocodeAsync({
            latitude: c[1],
            longitude: c[0],
          });
          const place = res[0];
          if (place?.city) setLocationLabel(`${place.city}${place.region ? `, ${place.region}` : ''}`);
        } catch {
          /* ignore */
        }
      } catch {
        /* GPS off — fine */
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
      const dx = c[0] - searchCenter[0];
      const dy = c[1] - searchCenter[1];
      const km = Math.sqrt(dx * dx + dy * dy) * 111;
      setShowSearchHere(km > 1);
    },
    [searchCenter],
  );

  const onPressFeature = useCallback(
    async (e: { features: Feature<Geometry>[] }) => {
      const f = e.features[0];
      if (!f || f.geometry.type !== 'Point') return;
      const props = (f.properties ?? {}) as Record<string, unknown>;
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
          /* ignore */
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
      Alert.alert('Location off', 'Turn on location in Settings to recenter.');
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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.c.bg, padding: 32 }}>
        <Text style={{ textAlign: 'center', color: theme.c.muted }}>
          Map is misconfigured: EXPO_PUBLIC_MAPBOX_TOKEN is missing.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.c.bg }}>
      <MapView
        style={{ flex: 1 }}
        styleURL={scheme === 'dark' ? STYLES.dark : STYLES.light}
        compassEnabled={false}
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
        {userPos ? <UserLocation visible androidRenderMode="normal" showsUserHeadingIndicator /> : null}
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
            <CircleLayer
              id="charger-clusters"
              filter={['has', 'point_count']}
              style={{
                circleColor: theme.c.ink,
                circleStrokeColor: theme.c.bg,
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
                textColor: theme.c.bg,
                textSize: 14,
                textFont: ['Open Sans Bold', 'Arial Unicode MS Bold'],
                textAllowOverlap: true,
                textIgnorePlacement: true,
              }}
            />
            <CircleLayer
              id="charger-pin-bg"
              filter={['!', ['has', 'point_count']]}
              style={{
                circleColor: [
                  'case',
                  ['==', ['get', 'available'], true],
                  theme.c.greenPill,
                  '#D4D2CB',
                ],
                circleRadius: 18,
                circleStrokeColor: theme.c.bg,
                circleStrokeWidth: 3,
              }}
            />
            <SymbolLayer
              id="charger-pin-icon"
              filter={['!', ['has', 'point_count']]}
              style={{
                textField: '⚡',
                textColor: theme.c.green2,
                textSize: 14,
                textAllowOverlap: true,
                textIgnorePlacement: true,
              }}
            />
          </ShapeSource>
        ) : null}
      </MapView>

      {/* Top floating search bar */}
      <View
        style={{
          position: 'absolute',
          top: 60,
          left: 20,
          right: 20,
          flexDirection: 'row',
          gap: 8,
        }}
      >
        <View
          style={{
            flex: 1,
            height: 44,
            borderRadius: 22,
            backgroundColor: theme.c.card,
            ...theme.shadow.cardLight,
            paddingHorizontal: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Search size={16} color={theme.c.muted} />
          <Text style={{ color: theme.c.muted, fontSize: 13 }}>{locationLabel}</Text>
        </View>
        <IconCircle size={44}>
          <Bolt size={18} color={theme.c.ink} />
        </IconCircle>
      </View>

      {/* Search this area */}
      {showSearchHere ? (
        <View
          style={{
            position: 'absolute',
            top: 116,
            alignSelf: 'center',
            left: 0,
            right: 0,
            alignItems: 'center',
          }}
        >
          <View
            style={{
              backgroundColor: theme.c.ink,
              paddingHorizontal: 14,
              height: 32,
              borderRadius: 16,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              ...theme.shadow.pillFloat,
            }}
          >
            <Search size={12} color={theme.c.bg} />
            <Text
              onPress={searchHere}
              style={{ color: theme.c.bg, fontWeight: '600', fontSize: 12 }}
            >
              Search this area
            </Text>
          </View>
        </View>
      ) : null}

      {/* Loading badge */}
      {nearby.isFetching ? (
        <View
          style={{
            position: 'absolute',
            top: 116,
            right: 20,
            backgroundColor: theme.c.card,
            borderRadius: 999,
            padding: 8,
            ...theme.shadow.cardLight,
          }}
        >
          <ActivityIndicator size="small" />
        </View>
      ) : null}

      {/* Recenter FAB */}
      <View style={{ position: 'absolute', right: 16, bottom: 24 }}>
        <IconCircle size={48} onPress={recenter}>
          <Recenter size={18} color={theme.c.ink} />
        </IconCircle>
      </View>
    </View>
  );
}
