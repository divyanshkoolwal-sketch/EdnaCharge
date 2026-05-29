/**
 * Tests for the MQTT topic dispatcher in mqtt-client.ts.
 * Mocks the underlying mqtt.js client so we can verify subscribe/unsubscribe
 * counts + handler dispatching without a real broker.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockClient = {
  connected: true,
  subscribe: vi.fn((_topic: string, _opts: unknown, cb: (e: Error | null) => void) => cb(null)),
  unsubscribe: vi.fn((_topic: string, cb?: (e?: Error) => void) => cb?.(undefined)),
  publish: vi.fn((_t: string, _p: unknown, _o: unknown, cb: (e: Error | null) => void) => cb(null)),
  on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    if (event === 'message') mockClient._messageHandler = handler;
    if (event === 'connect') mockClient._connectHandler = handler;
  }),
  off: vi.fn(),
  once: vi.fn(),
  end: vi.fn((_force: boolean, _opts: unknown, cb?: () => void) => cb?.()),
  _messageHandler: undefined as undefined | ((...args: unknown[]) => void),
  _connectHandler: undefined as undefined | (() => void),
};

vi.mock('mqtt', () => ({
  default: { connect: vi.fn(() => mockClient) },
  connect: vi.fn(() => mockClient),
}));

describe('mqtt-client dispatcher', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockClient._messageHandler = undefined;
    // Reset the singleton client between tests
    const mod = await import('../src/lib/mqtt-client.js') as any;
    await mod.closeMqttClient();
  });

  it('dispatches messages to the right topic handler', async () => {
    const { mqttOnTopic } = await import('../src/lib/mqtt-client.js');
    const fooHandler = vi.fn();
    const barHandler = vi.fn();
    await mqttOnTopic('foo/status', fooHandler);
    await mqttOnTopic('bar/status', barHandler);

    // Simulate incoming message
    mockClient._messageHandler!('foo/status', Buffer.from('hello'));
    expect(fooHandler).toHaveBeenCalledTimes(1);
    expect(barHandler).not.toHaveBeenCalled();

    mockClient._messageHandler!('bar/status', Buffer.from('world'));
    expect(barHandler).toHaveBeenCalledTimes(1);
  });

  it('only subscribes ONCE per topic, even with multiple handlers', async () => {
    const { mqttOnTopic } = await import('../src/lib/mqtt-client.js');
    const h1 = vi.fn();
    const h2 = vi.fn();
    await mqttOnTopic('shared/topic', h1);
    await mqttOnTopic('shared/topic', h2);

    expect(mockClient.subscribe).toHaveBeenCalledTimes(1);

    // Both handlers fire on a single message
    mockClient._messageHandler!('shared/topic', Buffer.from('msg'));
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe removes only the specific handler, not others on the same topic', async () => {
    const { mqttOnTopic } = await import('../src/lib/mqtt-client.js');
    const h1 = vi.fn();
    const h2 = vi.fn();
    const unsub1 = await mqttOnTopic('shared/topic', h1);
    await mqttOnTopic('shared/topic', h2);

    unsub1();
    mockClient._messageHandler!('shared/topic', Buffer.from('msg'));
    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledTimes(1);

    // Topic still subscribed (h2 still listening)
    expect(mockClient.unsubscribe).not.toHaveBeenCalled();
  });

  it('unsubscribes from broker when LAST handler is removed', async () => {
    const { mqttOnTopic } = await import('../src/lib/mqtt-client.js');
    const h1 = vi.fn();
    const unsub = await mqttOnTopic('only/topic', h1);
    expect(mockClient.subscribe).toHaveBeenCalledTimes(1);

    unsub();
    expect(mockClient.unsubscribe).toHaveBeenCalledWith('only/topic', expect.any(Function));
  });

  it('handler that throws does NOT crash the dispatcher', async () => {
    const { mqttOnTopic } = await import('../src/lib/mqtt-client.js');
    const bad = vi.fn(() => { throw new Error('handler bug'); });
    const good = vi.fn();
    await mqttOnTopic('crash/topic', bad);
    await mqttOnTopic('crash/topic', good);

    // Should NOT throw — dispatcher swallows handler errors
    expect(() => mockClient._messageHandler!('crash/topic', Buffer.from('msg'))).not.toThrow();
    expect(bad).toHaveBeenCalled();
    // The good handler still fires even though bad threw
    expect(good).toHaveBeenCalled();
  });
});
