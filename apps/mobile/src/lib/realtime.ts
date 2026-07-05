/** @file apps/mobile/src/lib/realtime.ts. */
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
 * Open a realtime channel.
 *
 * By default the topic is made unique per call (remount-safety, see above) —
 * correct for `postgres_changes` subscriptions, which are filter-scoped so the
 * topic string is irrelevant.
 *
 * For `broadcast`, delivery is TOPIC-EXACT: the receiver's topic must equal the
 * sender's. Pass `{ exactTopic: true }` so the topic matches the sender (e.g. the
 * CSMS publishes meter values to `session:<id>` — a `#seq` suffix would silently
 * drop every message). To stay remount-safe with a fixed topic we first remove
 * any lingering channel on that topic, so callers never re-attach `.on()` to an
 * already-subscribed channel.
 *
 * Returns `null` when Supabase isn't configured (callers no-op).
 */
export function openRealtimeChannel(
  baseTopic: string,
  opts?: { exactTopic?: boolean },
): RealtimeSubscription | null {
  const client = supabase;
  if (!client) return null;

  let topic: string;
  if (opts?.exactTopic) {
    topic = baseTopic;
    // Drop any stale channel from a previous mount on this exact topic.
    for (const existing of client.getChannels()) {
      if (existing.topic === `realtime:${topic}` || existing.topic === topic) {
        void client.removeChannel(existing);
      }
    }
  } else {
    channelSeq += 1;
    topic = `${baseTopic}#${channelSeq}`;
  }
  const channel = client.channel(topic);

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
