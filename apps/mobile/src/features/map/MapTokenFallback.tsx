/** List fallback shown when Mapbox is not configured. */
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import type { useTheme } from '../../theme/useTheme';
import type { Charger } from './model';

type Props = {
  chargers: Charger[];
  isLoading: boolean;
  isError: boolean;
  onOpenCharger: (id: string) => void;
  theme: ReturnType<typeof useTheme>;
};

export function MapTokenFallback({ chargers, isLoading, isError, onOpenCharger, theme }: Props) {
  return (
    <View style={{ flex: 1, backgroundColor: theme.c.bg, padding: 20, paddingTop: 64 }}>
      <Text style={{ color: theme.c.ink, fontSize: 28, fontWeight: '800' }}>Nearby chargers</Text>
      <Text style={{ color: theme.c.muted, fontSize: 14, marginTop: 8 }}>
        Map view needs EXPO_PUBLIC_MAPBOX_TOKEN. Showing available chargers as a list.
      </Text>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ gap: 10, paddingTop: 22, paddingBottom: 24 }}>
          {chargers.map((charger) => (
            <Pressable
              key={charger.id}
              onPress={() => onOpenCharger(charger.id)}
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
                {charger.connectorType} · {charger.powerKw} kW ·{' '}
                {(charger.distanceM / 1609.34).toFixed(1)} mi
              </Text>
            </Pressable>
          ))}
          {!isLoading && chargers.length === 0 ? (
            <Text style={{ color: theme.c.muted, marginTop: 24, textAlign: 'center' }}>
              {isError ? 'Could not load chargers. Pull to refresh.' : 'No nearby chargers found.'}
            </Text>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}
