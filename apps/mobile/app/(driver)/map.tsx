/** @file apps/mobile/app/(driver)/map.tsx. */
// Driver map — Mapbox-rendered with the design's overlay chrome (search bar,
// search-this-area pill, recenter FAB).
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Alert, useColorScheme, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
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
import { trpc } from '../../src/lib/trpc';
import { useTheme } from '../../src/theme/useTheme';
import { useUserLocation } from '../../src/state/userLocation';
import { useToast, Button, Body } from '../../src/components/ui';
import { MapChrome } from '../../src/features/map/MapChrome';
import { MapTokenFallback } from '../../src/features/map/MapTokenFallback';
import {
  chargerFeatures,
  MAP_STYLES,
  TRI_VALLEY,
  type Coordinate,
  type Charger,
  type MapFeature,
  type PointGeometry,
} from '../../src/features/map/model';
import { useDriverMapLocation } from '../../src/features/map/useDriverMapLocation';
import { useChargerRealtimeRefetch } from '../../src/features/map/useChargerRealtime';

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';

Mapbox.setAccessToken(MAPBOX_TOKEN);
Mapbox.setTelemetryEnabled(false);

export default function Map() {
  const router = useRouter();
  const scheme = useColorScheme();
  const theme = useTheme();
  const cameraRef = useRef<CameraRef>(null);
  const sourceRef = useRef<ShapeSource | null>(null);

  const [searchCenter, setSearchCenter] = useState<Coordinate>(TRI_VALLEY);
  const [viewCenter, setViewCenter] = useState<Coordinate>(TRI_VALLEY);
  const [showSearchHere, setShowSearchHere] = useState(false);
  const [styleLoaded, setStyleLoaded] = useState(false);
  const [availableNow, setAvailableNow] = useState(true);
  const [highPowerOnly, setHighPowerOnly] = useState(false);
  const [capPeakPrice, setCapPeakPrice] = useState(false);
  // Default to only showing plugs that match the driver's connector, but let
  // them tap the "My plug" pill to widen the search to every connector type.
  const [plugOnly, setPlugOnly] = useState(true);
  const setUserCoords = useUserLocation((s) => s.set);
  const utils = trpc.useUtils();
  const session = trpc.auth.getSession.useQuery();
  const driverConnector = session.data?.driverProfile?.connectorType;
  const { userPos, locationLabel } = useDriverMapLocation({
    cameraRef,
    setSearchCenter,
    setUserCoords,
  });

  const nearby = trpc.charger.nearby.useQuery(
    {
      lat: searchCenter[1],
      lng: searchCenter[0],
      radiusMeters: 25_000,
      filters: {
        connectorType: plugOnly ? driverConnector : undefined,
        availableNow,
        minPowerKw: highPowerOnly ? 7 : undefined,
        maxPriceCents: capPeakPrice ? 68 : undefined,
      },
    },
    {
      // Belt-and-braces: even if Realtime is unreachable we still pick up new
      // chargers within a half-minute.
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
    },
  );

  // Transient heads-up; the persistent banner with a real Retry is rendered below.
  const toast = useToast();
  useEffect(() => {
    if (nearby.isError) toast.show('Could not load nearby chargers.', 'error');
  }, [nearby.isError, toast]);

  // Refetch whenever the user returns to the Map tab so a charger they (or
  // another host) just published shows up without manual refresh.
  useFocusEffect(
    useCallback(() => {
      utils.charger.nearby.invalidate();
    }, [utils]),
  );

  // Realtime push: a newly published (or updated) charger appears within ~1s,
  // coalesced so a platform-wide burst of Charger updates can't storm refetches.
  useChargerRealtimeRefetch(() => utils.charger.nearby.invalidate());

  const chargers = nearby.data ?? [];
  const features = useMemo(() => chargerFeatures(chargers), [chargers]);

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
    async (e: { features: MapFeature[] }) => {
      const f = e.features[0];
      if (!f || f.geometry.type !== 'Point') return;
      const props = (f.properties ?? {}) as Record<string, unknown>;
      if (props.cluster) {
        const cluster = f as MapFeature<PointGeometry> & {
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
  const openCharger = useCallback(
    (id: string) => router.push({ pathname: '/(driver)/charger/[id]', params: { id } }),
    [router],
  );

  if (!MAPBOX_TOKEN) {
    return (
      <MapTokenFallback
        chargers={chargers}
        isLoading={nearby.isLoading}
        isError={nearby.isError}
        onOpenCharger={openCharger}
        theme={theme}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.c.bg }}>
      <MapView
        style={{ flex: 1 }}
        accessibilityLabel="Map of nearby chargers"
        styleURL={scheme === 'dark' ? MAP_STYLES.dark : MAP_STYLES.light}
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
            {/* Unclustered chargers as a GL CircleLayer, not a native
                PointAnnotation each (which defeated clustering + stuttered pan). */}
            <CircleLayer
              id="charger-points"
              filter={['!', ['has', 'point_count']]}
              style={{
                circleColor: ['case', ['get', 'available'], '#22A06B', '#9AA0A6'],
                circleRadius: 10,
                circleStrokeColor: '#FFFFFF',
                circleStrokeWidth: 3,
              }}
            />
          </ShapeSource>
        ) : null}
      </MapView>

      <MapChrome
        isFetching={nearby.isFetching}
        locationLabel={locationLabel}
        onRecenter={recenter}
        onSearchHere={searchHere}
        filters={{
          availableNow,
          highPowerOnly,
          capPeakPrice,
          hasConnector: !!driverConnector,
          plugActive: plugOnly,
        }}
        onToggleAvailable={() => setAvailableNow((v) => !v)}
        onToggleHighPower={() => setHighPowerOnly((v) => !v)}
        onToggleMaxPrice={() => setCapPeakPrice((v) => !v)}
        onTogglePlug={() => setPlugOnly((v) => !v)}
        showEmpty={!nearby.isLoading && !nearby.isError && chargers.length === 0}
        showSearchHere={showSearchHere}
        theme={theme}
      />

      {nearby.isError ? (
        <View
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: 40,
            backgroundColor: theme.c.card,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: theme.c.line,
            padding: 16,
            gap: 10,
          }}
        >
          <Body>Couldn’t load nearby chargers. Check your connection.</Body>
          <Button label={nearby.isFetching ? 'Retrying…' : 'Retry'} loading={nearby.isFetching} onPress={() => nearby.refetch()} />
        </View>
      ) : null}
    </View>
  );
}
