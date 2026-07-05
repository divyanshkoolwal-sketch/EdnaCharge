/** Floating controls layered above the driver map. */
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { useTheme } from '../../theme/useTheme';
import { Search, Recenter } from '../../components/icons/Icon';
import { IconCircle } from '../../components/ui';
import { VerificationBanner } from '../../components/VerificationBanner';

type Props = {
  isFetching: boolean;
  locationLabel: string;
  onRecenter: () => void;
  onSearchHere: () => void;
  onToggleAvailable: () => void;
  onToggleHighPower: () => void;
  onToggleMaxPrice: () => void;
  onTogglePlug: () => void;
  filters: {
    availableNow: boolean;
    highPowerOnly: boolean;
    capPeakPrice: boolean;
    hasConnector: boolean;
    plugActive: boolean;
  };
  showEmpty: boolean;
  showSearchHere: boolean;
  theme: ReturnType<typeof useTheme>;
};

export function MapChrome({
  isFetching,
  locationLabel,
  onRecenter,
  onSearchHere,
  onToggleAvailable,
  onToggleHighPower,
  onToggleMaxPrice,
  onTogglePlug,
  filters,
  showEmpty,
  showSearchHere,
  theme,
}: Props) {
  return (
    <>
      <View
        style={{ position: 'absolute', top: 60, left: 20, right: 20, flexDirection: 'row', gap: 8 }}
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
      </View>

      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', top: 98, left: 20, right: 20, gap: 8 }}
      >
        <VerificationBanner next="/(driver)/map" role="driver" />
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <FilterPill
            label="Available"
            active={filters.availableNow}
            onPress={onToggleAvailable}
            theme={theme}
          />
          <FilterPill
            label="7kW+"
            active={filters.highPowerOnly}
            onPress={onToggleHighPower}
            theme={theme}
          />
          <FilterPill
            label="Avoid peak"
            active={filters.capPeakPrice}
            onPress={onToggleMaxPrice}
            theme={theme}
          />
          {filters.hasConnector ? (
            <FilterPill
              label="My plug"
              active={filters.plugActive}
              onPress={onTogglePlug}
              theme={theme}
            />
          ) : null}
        </View>
        <View pointerEvents="box-none" style={{ minHeight: 32, alignItems: 'center' }}>
          {showSearchHere ? (
            <Pressable
              onPress={onSearchHere}
              accessibilityRole="button"
              accessibilityLabel="Search this map area"
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
              <Text style={{ color: theme.c.bg, fontWeight: '600', fontSize: 12 }}>
                Search this area
              </Text>
            </Pressable>
          ) : null}
          {isFetching ? (
            <View
              style={{
                position: 'absolute',
                right: 0,
                backgroundColor: theme.c.card,
                borderRadius: 999,
                padding: 8,
                ...theme.shadow.cardLight,
              }}
            >
              <ActivityIndicator size="small" />
            </View>
          ) : null}
        </View>
      </View>

      {showEmpty ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              backgroundColor: theme.c.card,
              paddingHorizontal: 16,
              height: 40,
              borderRadius: 20,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              ...theme.shadow.cardLight,
            }}
          >
            <Search size={14} color={theme.c.muted} />
            <Text style={{ color: theme.c.muted, fontWeight: '600', fontSize: 13 }}>
              {filters.highPowerOnly || filters.capPeakPrice || filters.hasConnector
                ? 'No chargers match your filters'
                : 'No chargers in this area'}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={{ position: 'absolute', right: 16, bottom: 24 }}>
        <IconCircle size={48} onPress={onRecenter} accessibilityLabel="Recenter map on my location">
          <Recenter size={18} color={theme.c.ink} />
        </IconCircle>
      </View>
    </>
  );
}

function FilterPill({
  label,
  active,
  onPress,
  theme,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={{
        height: 30,
        paddingHorizontal: 12,
        borderRadius: 15,
        backgroundColor: active ? theme.c.ink : theme.c.card,
        alignItems: 'center',
        justifyContent: 'center',
        ...theme.shadow.cardLight,
      }}
    >
      <Text style={{ color: active ? theme.c.bg : theme.c.muted, fontWeight: '700', fontSize: 12 }}>
        {label}
      </Text>
    </Pressable>
  );
}
