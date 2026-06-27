// Driver map — Mapbox-rendered with the design's overlay chrome (search bar,
// search-this-area pill, recenter FAB).
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, Text, ActivityIndicator, Alert, Pressable, ScrollView, useColorScheme } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import Mapbox, {
  MapView,
  Camera,
  ShapeSource,
  SymbolLayer,
  CircleLayer,
  UserLocation,
  PointAnnotation,
  type MapState,
} from '@rnmapbox/maps';
import type { CameraRef } from '@rnmapbox/maps/lib/typescript/src/components/Camera';
import type { FeatureCollection, Feature, Point, Geometry } from 'geojson';
import { trpc } from '../../src/lib/trpc';
import { openRealtimeChannel } from '../../src/lib/realtime';
import { useTheme } from '../../src/theme/useTheme';
import { useUserLocation } from '../../src/state/userLocation';
import { Search, Recenter, Bolt } from '../../src/components/icons/Icon';
import { IconCircle, useToast } from '../../src/components/ui';
import { VerificationBanner } from '../../src/components/VerificationBanner';

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
  const setUserCoords = useUserLocation((s) => s.set);
  const utils = trpc.useUtils();

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
        // Publish to the global store so charger detail can compute distance.
        setUserCoords({ lng: c[0], lat: c[1] });
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
  }, [setUserCoords]);

  const nearby = trpc.charger.nearby.useQuery(
    {
      lat: searchCenter[1],
      lng: searchCenter[0],
      radiusMeters: 25_000,
    },
    {
      // Belt-and-braces: even if Realtime is unreachable we still pick up new
      // chargers within a half-minute.
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
    },
  );

  // Surface nearby-charger load failures (previously silent → blank map).
  const toast = useToast();
  useEffect(() => {
    if (nearby.isError) toast.show('Could not load nearby chargers. Retrying…', 'error');
  }, [nearby.isError, toast]);

  // Refetch whenever the user returns to the Map tab so a charger they (or
  // another host) just published shows up without manual refresh.
  useFocusEffect(
    useCallback(() => {
      utils.charger.nearby.invalidate();
    }, [utils]),
  );

  // Realtime push: subscribe to inserts/updates on the Charger table. As soon
  // as a host publishes via charger.create, every driver with the map open
  // sees the new pin within ~1 second.
  useEffect(() => {
    // Unique topic per mount — a host→driver role switch (or tab/route
    // re-entry) re-mounts this screen, and re-using a fixed channel topic made
    // Supabase re-attach `.on()` to an already-subscribed channel and throw,
    // which crashed the app on the way into the map. See src/lib/realtime.ts.
    const sub = openRealtimeChannel('charger-inserts');
    if (!sub) return undefined;
    const invalidate = () => {
      utils.charger.nearby.invalidate();
    };
    sub.channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'Charger' }, invalidate)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'Charger' }, invalidate)
      .subscribe();
    return sub.remove;
  }, [utils]);

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
      <View style={{ flex: 1, backgroundColor: theme.c.bg, padding: 20, paddingTop: 64 }}>
        <Text style={{ color: theme.c.ink, fontSize: 28, fontWeight: '800' }}>Nearby chargers</Text>
        <Text style={{ color: theme.c.muted, fontSize: 14, marginTop: 8 }}>
          Map view needs EXPO_PUBLIC_MAPBOX_TOKEN. Showing available chargers as a list for now.
        </Text>

        {nearby.isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator />
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ gap: 10, paddingTop: 22, paddingBottom: 24 }}>
            {(nearby.data ?? []).map((charger: Charger) => (
              <Pressable
                key={charger.id}
                onPress={() => router.push({ pathname: '/(driver)/charger/[id]', params: { id: charger.id } })}
                style={{
                  backgroundColor: theme.c.card,
                  borderRadius: 16,
                  padding: 16,
                  ...theme.shadow.cardLight,
                }}
              >
                <Text style={{ color: theme.c.ink, fontSize: 16, fontWeight: '700' }}>
                  {charger.title}
                </Text>
                <Text style={{ color: theme.c.muted, fontSize: 13, marginTop: 6 }}>
                  {charger.connectorType} · {charger.powerKw} kW · {(charger.distanceM / 1609.34).toFixed(1)} mi
                </Text>
              </Pressable>
            ))}
            {!nearby.isLoading && (nearby.data ?? []).length === 0 ? (
              <Text style={{ color: theme.c.muted, marginTop: 24, textAlign: 'center' }}>
                No nearby chargers found.
              </Text>
            ) : null}
          </ScrollView>
        )}
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
          </ShapeSource>
        ) : null}
        {styleLoaded
          ? (nearby.data ?? []).map((charger: Charger) => (
              <PointAnnotation
                key={charger.id}
                id={`charger-${charger.id}`}
                coordinate={[charger.lng, charger.lat]}
                anchor={{ x: 0.5, y: 1 }}
                onSelected={() =>
                  router.push({
                    pathname: '/(driver)/charger/[id]',
                    params: { id: charger.id },
                  })
                }
              >
                <View
                  style={{ alignItems: 'center', justifyContent: 'center', width: 36, height: 48 }}
                >
                  <View
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 15,
                      backgroundColor:
                        charger.status === 'available' ? '#22A06B' : '#9AA0A6',
                      borderWidth: 3,
                      borderColor: '#FFFFFF',
                      alignItems: 'center',
                      justifyContent: 'center',
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.3,
                      shadowRadius: 3,
                    }}
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '900' }}>⚡</Text>
                  </View>
                  <View
                    style={{
                      width: 0,
                      height: 0,
                      borderLeftWidth: 6,
                      borderRightWidth: 6,
                      borderTopWidth: 10,
                      borderLeftColor: 'transparent',
                      borderRightColor: 'transparent',
                      borderTopColor:
                        charger.status === 'available' ? '#22A06B' : '#9AA0A6',
                      marginTop: -2,
                    }}
                  />
                </View>
              </PointAnnotation>
            ))
          : null}
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

      {/* Verification banner — only shows when not verified */}
      <View style={{ position: 'absolute', top: 110, left: 20, right: 20 }}>
        <VerificationBanner next="/(driver)/map" role="driver" />
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
