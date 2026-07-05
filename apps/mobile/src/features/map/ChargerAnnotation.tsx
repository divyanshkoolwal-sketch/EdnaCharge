/** Mapbox point annotation for one charger. */
import { Text, View } from 'react-native';
import { PointAnnotation } from '@rnmapbox/maps';
import type { Charger } from './model';

export function ChargerAnnotation({
  charger,
  onSelect,
}: {
  charger: Charger;
  onSelect: (id: string) => void;
}) {
  const available = charger.status === 'available';
  const color = available ? '#22A06B' : '#9AA0A6';
  return (
    <PointAnnotation
      id={`charger-${charger.id}`}
      coordinate={[charger.lng, charger.lat]}
      anchor={{ x: 0.5, y: 1 }}
      onSelected={() => onSelect(charger.id)}
    >
      <View style={{ alignItems: 'center', justifyContent: 'center', width: 36, height: 48 }}>
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            backgroundColor: color,
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
            borderTopColor: color,
            marginTop: -2,
          }}
        />
      </View>
    </PointAnnotation>
  );
}
