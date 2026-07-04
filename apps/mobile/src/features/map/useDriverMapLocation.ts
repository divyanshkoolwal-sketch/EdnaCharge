/** Location bootstrap for the driver charger map. */
import { useEffect, useState, type RefObject } from 'react';
import * as Location from 'expo-location';
import type { CameraRef } from '@rnmapbox/maps/lib/typescript/src/components/Camera';
import type { Coordinate } from './model';

type UserCoordsSetter = (coords: { lng: number; lat: number }) => void;

export function useDriverMapLocation({
  cameraRef,
  setSearchCenter,
  setUserCoords,
}: {
  cameraRef: RefObject<CameraRef>;
  setSearchCenter: (center: Coordinate) => void;
  setUserCoords: UserCoordsSetter;
}) {
  const [userPos, setUserPos] = useState<Coordinate | null>(null);
  const [locationLabel, setLocationLabel] = useState('Tri-Valley');

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const c: Coordinate = [pos.coords.longitude, pos.coords.latitude];
        setUserPos(c);
        setSearchCenter(c);
        setUserCoords({ lng: c[0], lat: c[1] });
        cameraRef.current?.setCamera({
          centerCoordinate: c,
          zoomLevel: 13,
          animationDuration: 600,
        });
        try {
          const res = await Location.reverseGeocodeAsync({
            latitude: c[1],
            longitude: c[0],
          });
          const place = res[0];
          if (place?.city) {
            setLocationLabel(`${place.city}${place.region ? `, ${place.region}` : ''}`);
          }
        } catch {
          /* ignore */
        }
      } catch {
        /* GPS off */
      }
    })();
  }, [cameraRef, setSearchCenter, setUserCoords]);

  return { userPos, locationLabel };
}
