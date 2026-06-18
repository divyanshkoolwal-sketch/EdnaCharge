import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

/**
 * Supabase realtime, made safe against React remounts.
 *
 * Background: a screen that opens a realtime channel with a FIXED topic name
 * (e.g. the driver map's `charger-inserts`) crashes when the screen mounts a
 * second time — tab switch, role switch, or a `router.replace` into the screen.
 * Supabase keys channels by topic, so the second mount re-attaches `.on(...)`
 * to a channel that is already `subscribe()`d and throws:
 *
 *   "cannot add `postgres_changes` callbacks for realtime:<topic> after `subscribe()`."
 *
 * That throw happens inside a `useEffect`, so it is uncaught: a red box in dev
 * and a hard CRASH in release (this was the Host→Driver crash AND the
 * "map not working" report — the map screen never finished mounting).
 *
 * Fix: give every subscription a topic that is unique to the individual call,
 * so a lingering channel from a previous mount can never be re-used. Callers
 * attach their own `.on(...)` handlers and `.subscribe()`, then return
 * `remove` from their effect cleanup.
 */

let channelSeq = 0;

export type RealtimeSubscription = {
  channel: RealtimeChannel;
  /** Removes the channel from the client. Idempotent — safe in effect cleanup. */
  remove: () => void;
};

/**
 * Open a realtime channel whose topic is unique to this call.
 * Returns `null` when Supabase isn't configured (callers no-op).
 */
export function openRealtimeChannel(baseTopic: string): RealtimeSubscription | null {
  const client = supabase;
  if (!client) return null;

  channelSeq += 1;
  const channel = client.channel(`${baseTopic}#${channelSeq}`);

  let removed = false;
  return {
    channel,
    remove: () => {
      if (removed) return;
      removed = true;
      void client.removeChannel(channel);
    },
  };
}
