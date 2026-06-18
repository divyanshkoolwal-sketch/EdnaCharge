/**
 * Regression test for the Host→Driver crash (and "map not working").
 *
 * The map opened a realtime channel with a FIXED topic. On the second mount
 * (host→driver role switch / tab switch / router.replace) Supabase re-attached
 * `.on()` to the already-subscribed channel and threw
 * "cannot add postgres_changes callbacks after subscribe()" — an uncaught
 * error in a useEffect that crashed the release app.
 *
 * `openRealtimeChannel` must therefore hand out a UNIQUE topic per call so a
 * remount can never collide with a lingering channel, `remove()` must tear the
 * channel down (idempotently), and it must no-op when Supabase is unconfigured.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { channelMock, removeChannelMock, holder } = vi.hoisted(() => {
  const channelMock = vi.fn((topic: string) => ({ topic }));
  const removeChannelMock = vi.fn();
  const holder = {
    client: { channel: channelMock, removeChannel: removeChannelMock } as unknown as
      | { channel: typeof channelMock; removeChannel: typeof removeChannelMock }
      | null,
  };
  return { channelMock, removeChannelMock, holder };
});

// Getter so each access of `supabase` reflects the current `holder.client`,
// letting one test flip it to null without re-importing the module.
vi.mock('../src/lib/supabase', () => ({
  get supabase() {
    return holder.client;
  },
}));

import { openRealtimeChannel } from '../src/lib/realtime';

describe('openRealtimeChannel — remount safety', () => {
  beforeEach(() => {
    holder.client = { channel: channelMock, removeChannel: removeChannelMock };
    channelMock.mockClear();
    removeChannelMock.mockClear();
  });

  it('gives each call a UNIQUE channel topic (no fixed-topic collision)', () => {
    const a = openRealtimeChannel('charger-inserts');
    const b = openRealtimeChannel('charger-inserts');
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    const topicA = channelMock.mock.calls[0][0];
    const topicB = channelMock.mock.calls[1][0];
    // Same base, different suffix → the second mount never re-uses the first
    // (already-subscribed) channel.
    expect(topicA).toContain('charger-inserts');
    expect(topicB).toContain('charger-inserts');
    expect(topicA).not.toBe(topicB);
  });

  it('remove() tears the channel down and is idempotent', () => {
    const sub = openRealtimeChannel('charger-inserts')!;
    sub.remove();
    sub.remove();
    expect(removeChannelMock).toHaveBeenCalledTimes(1);
    expect(removeChannelMock).toHaveBeenCalledWith(sub.channel);
  });

  it('returns null when Supabase is unconfigured (no crash)', () => {
    holder.client = null;
    expect(openRealtimeChannel('charger-inserts')).toBeNull();
  });
});
