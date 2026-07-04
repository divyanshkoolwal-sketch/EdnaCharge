/** @file apps/mobile/src/features/map/useChargerRealtime.ts. */
import { useEffect } from 'react';
import { openRealtimeChannel } from '../../lib/realtime';

/**
 * Subscribe to Charger INSERT/UPDATE broadcasts and invoke `onChange` when a
 * relevant change lands, so a newly published (or updated) charger appears on
 * the driver map within ~1s.
 *
 * Realtime can't scope this to the driver's viewport, so EVERY Charger
 * INSERT/UPDATE anywhere on the platform fires here (e.g. a host toggling
 * availability across town). Without coalescing, a burst of unrelated updates
 * would trigger one refetch per event on every driver's device. We throttle to
 * at most one `onChange` per `windowMs`; the caller's poll + focus-refetch still
 * catch anything a dropped trailing edge would miss.
 */
export function useChargerRealtimeRefetch(onChange: () => void, windowMs = 1500): void {
  useEffect(() => {
    const sub = openRealtimeChannel('charger-inserts');
    if (!sub) return undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const invalidate = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        onChange();
      }, windowMs);
    };
    sub.channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'Charger' }, invalidate)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'Charger' }, invalidate)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      sub.remove();
    };
    // onChange is expected to be a stable/idempotent invalidator; windowMs is a
    // constant. Re-subscribing on every render would tear down the channel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
