/** Map picker used to place a host charger pin. */
import { View } from 'react-native';
import { Camera, MapView, PointAnnotation } from '@rnmapbox/maps';
import type { CameraRef } from '@rnmapbox/maps/lib/typescript/src/components/Camera';
import { Button, Label, Muted } from '../../components/ui';
import { useTheme } from '../../theme/useTheme';

export type ChargerCameraRef = CameraRef;

const STYLES = {
  light: 'mapbox://styles/mapbox/streets-v12',
  dark: 'mapbox://styles/mapbox/dark-v11',
};

export function ChargerLocationPicker({
  cameraRef,
  scheme,
  lat,
  lng,
  pinConfirmed,
  setLat,
  setLng,
  setPinConfirmed,
}: {
  cameraRef: React.RefObject<CameraRef>;
  scheme: string | null | undefined;
  lat: number;
  lng: number;
  pinConfirmed: boolean;
  setLat: (lat: number) => void;
  setLng: (lng: number) => void;
  setPinConfirmed: (confirmed: boolean) => void;
}) {
  const { c } = useTheme();
  return (
    <View>
      <Label style={{ marginBottom: 8 }}>LOCATION</Label>
      <Muted style={{ fontSize: 12, marginBottom: 8 }}>
        Drag the map to position the pin where the charger actually is.
      </Muted>
      <View
        style={{
          height: 220,
          borderRadius: 16,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: c.line,
        }}
      >
        <MapView
          style={{ flex: 1 }}
          styleURL={scheme === 'dark' ? STYLES.dark : STYLES.light}
          onCameraChanged={(s) => {
            const center = s.properties.center as [number, number] | undefined;
            if (!center) return;
            setLng(center[0]);
            setLat(center[1]);
            // Any movement invalidates a prior confirmation — the host must
            // re-confirm the pin actually sits on the charger.
            setPinConfirmed(false);
          }}
        >
          <Camera
            ref={cameraRef}
            defaultSettings={{ centerCoordinate: [lng, lat], zoomLevel: 15 }}
            animationDuration={0}
          />
          <PointAnnotation id="charger-pin" coordinate={[lng, lat]}>
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: c.green2,
                borderWidth: 3,
                borderColor: c.bg,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: c.bg,
                }}
              />
            </View>
          </PointAnnotation>
        </MapView>
      </View>
      <Muted style={{ fontSize: 11, marginTop: 6 }}>
        {lat.toFixed(5)}, {lng.toFixed(5)}
      </Muted>
      {/* Always show the confirm control — the host must explicitly confirm the
          pin position, even when we seeded it from their GPS. */}
      <Button
        label={pinConfirmed ? '✓ Pin confirmed' : 'Use this pin'}
        variant="secondary"
        height={44}
        fontSize={14}
        onPress={() => setPinConfirmed(true)}
        style={{ marginTop: 8 }}
      />
    </View>
  );
}
