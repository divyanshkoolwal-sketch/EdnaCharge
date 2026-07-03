import { View } from 'react-native';
import { H2, Muted } from './Typography';
import { Button } from './Button';
import { space } from '../../theme/tokens';

/**
 * Reusable error state with a Retry affordance. Several screens previously
 * failed silently on a query error (blank screen). A consistent, recoverable
 * error surface — paired with TanStack Query's `refetch` — turns dead-ends
 * into a one-tap recovery, and announces politely to screen readers.
 */
export function ErrorState({
  title = 'Something went wrong',
  subtitle = "We couldn't load this. Check your connection and try again.",
  onRetry,
  retryLabel = 'Try again',
}: {
  title?: string;
  subtitle?: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLabel={`${title}. ${subtitle}`}
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: space.xxl,
        paddingHorizontal: space.xl,
      }}
    >
      <H2 style={{ textAlign: 'center' }}>{title}</H2>
      <Muted style={{ textAlign: 'center', marginTop: space.sm, fontSize: 13, maxWidth: 300 }}>
        {subtitle}
      </Muted>
      {onRetry ? (
        <View style={{ marginTop: space.lg, alignSelf: 'stretch', maxWidth: 320 }}>
          <Button label={retryLabel} variant="secondary" onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}
