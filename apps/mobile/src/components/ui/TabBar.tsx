// Custom tab bar matching the design canvas: no chrome, active tab gets a
// dot beneath it; icons inherit theme color. Used as Expo Router's
// tabBar via screenOptions.tabBar.
import { View, Pressable, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/useTheme';
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
        return (
          <Pressable
            key={t.key}
            onPress={() => onPress(t)}
            style={{
              alignItems: 'center',
              gap: 4,
              minWidth: 50,
            }}
          >
            <Icon size={22} color={active ? c.ink : c.muted2} />
            <Text
              style={{
                fontSize: 9,
                fontWeight: '500',
                color: active ? c.ink : c.muted2,
              }}
            >
              {t.label}
            </Text>
            {active ? (
              <View
                style={{
                  position: 'absolute',
                  bottom: -2,
                  width: 4,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: c.ink,
                }}
              />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
