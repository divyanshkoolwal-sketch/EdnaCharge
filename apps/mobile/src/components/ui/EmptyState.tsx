import { View } from 'react-native';
import { H2, Muted } from './Typography';
import { Button } from './Button';
import { space } from '../../theme/tokens';

/**
 * Reusable empty state. World-class apps never leave a blank list — they say
 * what's missing and offer the next action. Centralizing this guarantees a
 * consistent voice + spacing and an accessible announcement everywhere.
 */
export function EmptyState({
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
  compact,
}: {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  /** Optional next-action CTA (the friction-reducer — e.g. "Find a charger"). */
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}) {
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: compact ? space.xl : space.xxl + space.lg,
        paddingHorizontal: space.xl,
      }}
    >
      {icon ? <View style={{ marginBottom: space.md, opacity: 0.9 }}>{icon}</View> : null}
      <H2 style={{ textAlign: 'center' }}>{title}</H2>
      {subtitle ? (
        <Muted style={{ textAlign: 'center', marginTop: space.sm, fontSize: 13, maxWidth: 300 }}>
          {subtitle}
        </Muted>
      ) : null}
      {actionLabel && onAction ? (
        <View style={{ marginTop: space.lg, alignSelf: 'stretch', maxWidth: 320 }}>
          <Button label={actionLabel} variant="secondary" onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}
