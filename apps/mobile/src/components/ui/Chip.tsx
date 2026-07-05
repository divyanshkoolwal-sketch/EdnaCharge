/** @file apps/mobile/src/components/ui/Chip.tsx. */
import { Pressable, Text, View, type PressableProps } from 'react-native';
import { useTheme } from '../../theme/useTheme';

type ChipVariant = 'default' | 'green' | 'orange' | 'red' | 'dark' | 'outline';

type Props = Omit<PressableProps, 'children'> & {
  label: string;
  variant?: ChipVariant;
  selected?: boolean;
  iconLeft?: React.ReactNode;
};

export function Chip({ label, variant = 'default', selected, iconLeft, onPress, style, ...rest }: Props) {
  const { c, radius, fontSize, fontWeight } = useTheme();

  // Selected state overrides → dark.
  const v: ChipVariant = selected ? 'dark' : variant;

  const palette: Record<ChipVariant, { bg: string; fg: string; borderColor?: string }> = {
    default: { bg: c.chip, fg: c.ink2 },
    green: { bg: c.greenPill, fg: c.green2 },
    orange: { bg: c.orangePill, fg: '#C8804A' },
    red: { bg: c.redPill, fg: c.red },
    dark: { bg: c.ink, fg: c.bg },
    outline: { bg: 'transparent', fg: c.ink, borderColor: c.line2 },
  };
  const p = palette[v];

  return (
    <Pressable
      onPress={onPress}
      // Interactive chips read as buttons (with selected state); a Chip with no
      // onPress (e.g. StatusPill) reads as plain text so status is announced by
      // label, never by color alone.
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={label}
      accessibilityState={onPress ? { selected: !!selected } : undefined}
      {...rest}
      style={({ pressed }) => [
        {
          height: 28,
          paddingHorizontal: 12,
          borderRadius: radius.chip,
          backgroundColor: p.bg,
          borderWidth: v === 'outline' ? 1 : 0,
          borderColor: p.borderColor,
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          opacity: pressed ? 0.85 : 1,
        },
        typeof style === 'function' ? undefined : style,
      ]}
    >
      {iconLeft}
      <Text
        style={{
          color: p.fg,
          fontSize: fontSize.label,
          fontWeight: fontWeight.semibold,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// Status pill — typed dispatch matching the design's status taxonomy.
export type Status =
  | 'pending'
  | 'confirmed'
  | 'active'
  | 'completed'
  | 'declined'
  | 'cancelled'
  | 'available'
  | 'offline'
  | 'errored'
  | 'no_show';

const STATUS_MAP: Record<Status, { variant: ChipVariant; label: string }> = {
  pending: { variant: 'orange', label: 'Pending' },
  confirmed: { variant: 'green', label: 'Confirmed' },
  active: { variant: 'dark', label: 'Active' },
  completed: { variant: 'outline', label: 'Completed' },
  declined: { variant: 'red', label: 'Declined' },
  cancelled: { variant: 'outline', label: 'Cancelled' },
  available: { variant: 'green', label: 'Available' },
  offline: { variant: 'outline', label: 'Offline' },
  errored: { variant: 'red', label: 'Errored' },
  no_show: { variant: 'outline', label: 'No-show' },
};

export function StatusPill({ status }: { status: Status | string }) {
  const conf = STATUS_MAP[status as Status] ?? { variant: 'outline' as ChipVariant, label: String(status) };
  return <Chip label={conf.label} variant={conf.variant} />;
}

// Small green status dot — used inline next to "Available now" text.
export function StatusDot({ color }: { color?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color ?? c.green2 }} />
  );
}

// Tier badge — solid black pill with all-caps text.
export function TierBadge({ tier }: { tier: string | number }) {
  const { c, fontSize, fontWeight } = useTheme();
  return (
    <View
      style={{
        backgroundColor: c.ink,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        alignSelf: 'flex-start',
      }}
    >
      <Text
        style={{
          color: c.bg,
          fontSize: fontSize.micro,
          fontWeight: fontWeight.bold,
          letterSpacing: 0.3,
        }}
      >
        TIER {tier}
      </Text>
    </View>
  );
}
