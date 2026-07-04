/** @file apps/mobile/src/components/ui/TabBar.tsx. */
// Custom tab bar matching the design canvas: no chrome; the active tab is
// indicated by ink-colored icon + label. Used as Expo Router's tabBar via
// screenOptions.tabBar.
import { View, Pressable, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/useTheme';
import { haptics } from '../../lib/haptics';
import {
  PinIcon,
  ListIcon,
  Chat,
  User,
  Home,
  Bolt,
  Bell,
  CalendarIcon,
} from '../icons/Icon';

const ICONS = {
  map: PinIcon,
  bookings: ListIcon,
  chats: Chat,
  profile: User,
  home: Home,
  chargers: Bolt,
  requests: Bell,
  earnings: CalendarIcon,
} as const;

type IconName = keyof typeof ICONS;

export type TabSpec = {
  key: string;
  label: string;
  icon: IconName;
  href: string;
  /** Optional unread/pending count → red badge on the tab icon. */
  badge?: number;
};

export function TabBar({ tabs, activeKey, onPress }: {
  tabs: TabSpec[];
  activeKey: string;
  onPress: (t: TabSpec) => void;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        height: 70 + Math.max(0, insets.bottom - 14),
        paddingHorizontal: 18,
        paddingBottom: Math.max(14, insets.bottom),
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: c.line,
        backgroundColor: c.bg,
        justifyContent: 'space-around',
        alignItems: 'flex-start',
      }}
    >
      {tabs.map((t) => {
        const active = t.key === activeKey;
        const Icon = ICONS[t.icon];
        const count = t.badge ?? 0;
        return (
          <Pressable
            key={t.key}
            onPress={() => {
              if (!active) haptics.selection();
              onPress(t);
            }}
            // a11y: announce as a tab + its selected state + any unread count.
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={count > 0 ? `${t.label}, ${count} new` : t.label}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            style={{
              alignItems: 'center',
              gap: 4,
              minWidth: 50,
            }}
          >
            <View>
              <Icon size={22} color={active ? c.ink : c.muted2} />
              {count > 0 ? (
                <View
                  style={{
                    position: 'absolute',
                    top: -5,
                    right: -10,
                    minWidth: 16,
                    height: 16,
                    borderRadius: 8,
                    paddingHorizontal: 4,
                    backgroundColor: c.red,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1.5,
                    borderColor: c.bg,
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '800' }}>
                    {count > 9 ? '9+' : count}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text
              style={{
                fontSize: 9,
                fontWeight: '500',
                color: active ? c.ink : c.muted2,
              }}
            >
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
