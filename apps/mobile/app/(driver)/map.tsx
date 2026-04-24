import { useEffect, useState } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { trpc } from '../../src/lib/trpc';

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';

// @rnmapbox/maps requires native code — only available in a dev client / prod
// build, not in Expo Go. Try to load it; if it blows up, fall back to a list UI
// so the rest of the app remains usable during development.
let Mapbox: typeof import('@rnmapbox/maps') | null = null;
let mapboxAvailable = false;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Mapbox = require('@rnmapbox/maps');
  if (Mapbox && typeof Mapbox.setAccessToken === 'function') {
    Mapbox.setAccessToken(MAPBOX_TOKEN);
    mapboxAvailable = true;
  }
} catch {
  mapboxAvailable = false;
}

const TRI_VALLEY = { lat: 37.6819, lng: -121.8747 };

export default function Map() {
  const router = useRouter();
  const [center, setCenter] = useState<[number, number]>([TRI_VALLEY.lng, TRI_VALLEY.lat]);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const pos = await Location.getCurrentPositionAsync({});
        setCenter([pos.coords.longitude, pos.coords.latitude]);
      } catch {
        /* keep Tri-Valley default */
      }
    })();
  }, []);

  const nearby = trpc.charger.nearby.useQuery({
    lat: center[1],
    lng: center[0],
    radiusMeters: 25_000,
  });

  if (!mapboxAvailable || !MAPBOX_TOKEN) {
    return <FallbackList router={router} data={nearby.data} loading={nearby.isLoading} />;
  }

  const M = Mapbox!;
  return (
    <View className="flex-1">
      <M.MapView style={{ flex: 1 }}>
        <M.Camera zoomLevel={11} centerCoordinate={center} />
        <M.ShapeSource
          id="chargers"
          cluster
          clusterRadius={50}
          shape={{
            type: 'FeatureCollection',
            features:
              nearby.data?.map((c) => ({
                type: 'Feature' as const,
                id: c.id,
                properties: { id: c.id, title: c.title },
                geometry: { type: 'Point' as const, coordinates: [c.lng, c.lat] },
              })) ?? [],
          }}
          onPress={(e) => {
            const id = (e.features[0]?.properties as { id?: string } | undefined)?.id;
            if (id) router.push({ pathname: '/(driver)/charger/[id]', params: { id } });
          }}
        >
          <M.SymbolLayer
            id="charger-icons"
            style={{ textField: '⚡️', textSize: 22, textAllowOverlap: true }}
          />
          <M.CircleLayer
            id="charger-clusters"
            filter={['has', 'point_count']}
            style={{
              circleColor: '#000',
              circleRadius: ['step', ['get', 'point_count'], 18, 10, 24, 25, 30],
              circleStrokeColor: '#fff',
              circleStrokeWidth: 2,
            }}
          />
          <M.SymbolLayer
            id="charger-cluster-count"
            filter={['has', 'point_count']}
            style={{ textField: ['get', 'point_count'], textColor: '#fff', textSize: 14 }}
          />
        </M.ShapeSource>
      </M.MapView>
      {nearby.isLoading && (
        <View className="absolute top-16 right-4 bg-white rounded-full p-2 shadow">
          <ActivityIndicator />
        </View>
      )}
      <Pressable
        onPress={() => nearby.refetch()}
        className="absolute bottom-8 self-center bg-black rounded-full px-6 py-3"
      >
        <Text className="text-white">Search this area</Text>
      </Pressable>
    </View>
  );
}

function FallbackList({
  router,
  data,
  loading,
}: {
  router: ReturnType<typeof useRouter>;
  data: Array<{ id: string; title: string; powerKw: number; connectorType: string; pricePerKwhCents: number | null; pricePerHourCents: number | null; distanceM: number }> | undefined;
  loading: boolean;
}) {
  return (
    <View className="flex-1 bg-white pt-16 px-6">
      <Text className="text-3xl font-bold">Nearby chargers</Text>
      <Text className="text-gray-500 mt-1 text-sm">
        Running in Expo Go — map requires a dev build. Using list view.
      </Text>
      {loading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          className="mt-4"
          data={data ?? []}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => {
            const price = item.pricePerKwhCents
              ? `$${(item.pricePerKwhCents / 100).toFixed(2)}/kWh`
              : item.pricePerHourCents
                ? `$${(item.pricePerHourCents / 100).toFixed(2)}/hr`
                : '—';
            return (
              <Pressable
                onPress={() =>
                  router.push({ pathname: '/(driver)/charger/[id]', params: { id: item.id } })
                }
                className="border border-gray-200 rounded-xl p-4 mb-2"
              >
                <Text className="font-medium text-base">{item.title}</Text>
                <Text className="text-gray-500 text-sm">
                  {item.connectorType.toUpperCase()} · {item.powerKw} kW · {price}
                </Text>
                <Text className="text-gray-400 text-xs mt-1">
                  {(item.distanceM / 1000).toFixed(1)} km away
                </Text>
              </Pressable>
            );
          }}
          ListEmptyComponent={<Text className="text-gray-500">No chargers nearby.</Text>}
        />
      )}
    </View>
  );
}
