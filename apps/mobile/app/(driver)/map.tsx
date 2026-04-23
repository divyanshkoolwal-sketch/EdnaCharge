import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import Mapbox from '@rnmapbox/maps';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { trpc } from '../../src/lib/trpc';

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';
Mapbox.setAccessToken(MAPBOX_TOKEN);

const TRI_VALLEY = { lat: 37.6819, lng: -121.8747 };

export default function Map() {
  const router = useRouter();
  const [center, setCenter] = useState<[number, number]>([TRI_VALLEY.lng, TRI_VALLEY.lat]);
  const camRef = useRef<Mapbox.Camera>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({});
      setCenter([pos.coords.longitude, pos.coords.latitude]);
    })();
  }, []);

  const nearby = trpc.charger.nearby.useQuery({
    lat: center[1],
    lng: center[0],
    radiusMeters: 25_000,
  });

  if (!MAPBOX_TOKEN) {
    return (
      <View className="flex-1 bg-white items-center justify-center px-8">
        <Text className="text-center text-gray-700">
          Map requires EXPO_PUBLIC_MAPBOX_TOKEN in .env. See BLOCKERS.md.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <Mapbox.MapView style={{ flex: 1 }}>
        <Mapbox.Camera ref={camRef} zoomLevel={11} centerCoordinate={center} />
        <Mapbox.ShapeSource
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
          <Mapbox.SymbolLayer
            id="charger-icons"
            style={{ textField: '⚡️', textSize: 22, textAllowOverlap: true }}
          />
          <Mapbox.CircleLayer
            id="charger-clusters"
            filter={['has', 'point_count']}
            style={{
              circleColor: '#000',
              circleRadius: ['step', ['get', 'point_count'], 18, 10, 24, 25, 30],
              circleStrokeColor: '#fff',
              circleStrokeWidth: 2,
            }}
          />
          <Mapbox.SymbolLayer
            id="charger-cluster-count"
            filter={['has', 'point_count']}
            style={{ textField: ['get', 'point_count'], textColor: '#fff', textSize: 14 }}
          />
        </Mapbox.ShapeSource>
      </Mapbox.MapView>
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
