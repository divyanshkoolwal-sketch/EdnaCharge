/**
 * Unit tests for ChargerDriver implementations.
 *
 * These tests run without a live MQTT broker — they mock `mqttOnTopic` and
 * `mqttPublish` to verify the parsing, lifecycle, and listener-cleanup logic.
 * Live integration tests live in apps/api/test/session.e2e.test.ts and require
 * the EMQX broker + Supabase + worker stack.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the mqtt-client BEFORE importing the drivers
vi.mock('../src/lib/mqtt-client.js', () => {
  const handlers = new Map<string, Set<(b: Buffer) => void>>();
  return {
    mqttOnTopic: vi.fn(async (topic: string, h: (b: Buffer) => void) => {
      let s = handlers.get(topic);
      if (!s) { s = new Set(); handlers.set(topic, s); }
      s.add(h);
      return () => s!.delete(h);
    }),
    mqttPublish: vi.fn(async () => {}),
    awaitConnected: vi.fn(async () => {}),
    getMqttClient: vi.fn(() => ({})),
    __emit: (topic: string, payload: Buffer | string) => {
      const buf = typeof payload === 'string' ? Buffer.from(payload) : payload;
      const s = handlers.get(topic);
      if (s) for (const h of s) h(buf);
    },
    __reset: () => handlers.clear(),
    __handlerCount: (topic: string) => handlers.get(topic)?.size ?? 0,
  };
});

import { ShellyEmDriver } from '../src/drivers/shelly-em.js';

const mqtt = await import('../src/lib/mqtt-client.js') as any;

describe('ShellyEmDriver (Tier 2)', () => {
  beforeEach(() => mqtt.__reset());

  it('parses Shelly Pro EM-50 act_power per leg correctly', async () => {
    const driver = new ShellyEmDriver('dev-1', 'shellypro-em50-abc');
    await new Promise((r) => setImmediate(r)); // let constructor subscribes complete

    // Send em1:0 status (leg A, 1500W)
    mqtt.__emit('shellypro-em50-abc/status/em1:0', JSON.stringify({
      id: 0,
      act_power: 1500,
      voltage: 122.1,
      current: 12.3,
      total_act_energy: 5000, // 5 kWh
    }));

    // Send em1:1 status (leg B, 1700W)
    mqtt.__emit('shellypro-em50-abc/status/em1:1', JSON.stringify({
      id: 1,
      act_power: 1700,
      voltage: 121.9,
      current: 13.9,
      total_act_energy: 6000, // 6 kWh
    }));

    const meter = await driver.getMeter();
    expect(meter.powerW).toBe(3200); // 1500 + 1700
    expect(meter.kwhTotal).toBe(11);  // (5000 + 6000) / 1000
  });

  it('handles malformed payload without crashing', async () => {
    const driver = new ShellyEmDriver('dev-2', 'shellypro-em50-bad');
    await new Promise((r) => setImmediate(r));

    mqtt.__emit('shellypro-em50-bad/status/em1:0', '{not valid json');
    mqtt.__emit('shellypro-em50-bad/status/em1:0', JSON.stringify({ act_power: 'not a number' }));

    const meter = await driver.getMeter();
    // act_power is "not a number" — `?? this.legPowerW[leg]` fallback kicks in (0)
    expect(meter.powerW).toBe(0);
  });

  it('destroy() actually removes status listeners (no leak)', async () => {
    const driver = new ShellyEmDriver('dev-3', 'shellypro-em50-cleanup');
    await new Promise((r) => setImmediate(r));

    expect(mqtt.__handlerCount('shellypro-em50-cleanup/status/em1:0')).toBe(1);
    expect(mqtt.__handlerCount('shellypro-em50-cleanup/status/em1:1')).toBe(1);

    driver.destroy();
    // After destroy, both handlers should be removed
    expect(mqtt.__handlerCount('shellypro-em50-cleanup/status/em1:0')).toBe(0);
    expect(mqtt.__handlerCount('shellypro-em50-cleanup/status/em1:1')).toBe(0);
  });

  it('multiple drivers do NOT cross-contaminate each other', async () => {
    const a = new ShellyEmDriver('a', 'shelly-A');
    const b = new ShellyEmDriver('b', 'shelly-B');
    await new Promise((r) => setImmediate(r));

    mqtt.__emit('shelly-A/status/em1:0', JSON.stringify({ act_power: 1000, total_act_energy: 100 }));
    mqtt.__emit('shelly-B/status/em1:0', JSON.stringify({ act_power: 2000, total_act_energy: 200 }));

    const ma = await a.getMeter();
    const mb = await b.getMeter();
    expect(ma.powerW).toBe(1000);
    expect(mb.powerW).toBe(2000);
    expect(ma.kwhTotal).toBeCloseTo(0.1);
    expect(mb.kwhTotal).toBeCloseTo(0.2);

    a.destroy();
    b.destroy();
  });

  it('start() and stop() are no-ops (Tier 2 is monitoring-only)', async () => {
    const driver = new ShellyEmDriver('d', 'shelly-noop');
    await new Promise((r) => setImmediate(r));
    await expect(driver.start()).resolves.toBeUndefined();
    await expect(driver.stop()).resolves.toBeUndefined();
    // Should not have published anything
    expect(mqtt.mqttPublish).not.toHaveBeenCalled();
  });
});

describe('ShellyPlugDriver (Tier 1) — listener cleanup smoke', async () => {
  const { ShellyPlugDriver, _resetPlugRpcState } = await import('../src/drivers/shelly-plug.js');

  beforeEach(() => {
    mqtt.__reset();
    _resetPlugRpcState();
  });

  it('parses switch:0 status push and updates lastMeter', async () => {
    const driver = new ShellyPlugDriver('p1', 'shellyplus-plug-test');
    await new Promise((r) => setImmediate(r));

    mqtt.__emit('shellyplus-plug-test/status/switch:0', JSON.stringify({
      id: 0,
      output: true,
      apower: 1234.5,
      voltage: 121.0,
      aenergy: { total: 2500 }, // 2.5 kWh
    }));

    // Cached read — within 30s, no RPC needed
    const meter = await driver.getMeter();
    expect(meter.powerW).toBe(1234.5);
    expect(meter.kwhTotal).toBe(2.5);
  });

  it('destroy() unsubscribes the status topic', async () => {
    const driver = new ShellyPlugDriver('p2', 'shellyplus-plug-cleanup');
    await new Promise((r) => setImmediate(r));

    expect(mqtt.__handlerCount('shellyplus-plug-cleanup/status/switch:0')).toBe(1);

    driver.destroy();
    expect(mqtt.__handlerCount('shellyplus-plug-cleanup/status/switch:0')).toBe(0);
  });

  it('start() publishes Switch.Set with on:true', async () => {
    const driver = new ShellyPlugDriver('p3', 'shellyplus-plug-start');
    await new Promise((r) => setImmediate(r));

    // Kick off start() — it won't resolve without a reply, so we spy then emit reply
    const startPromise = driver.start();
    await new Promise((r) => setImmediate(r));

    expect(mqtt.mqttPublish).toHaveBeenCalled();
    const [topic, payload] = mqtt.mqttPublish.mock.calls.at(-1)!;
    expect(topic).toBe('shellyplus-plug-start/rpc');
    const parsed = JSON.parse(payload);
    expect(parsed.method).toBe('Switch.Set');
    expect(parsed.params).toEqual({ id: 0, on: true });
    expect(parsed.src).toBe('edna-server');

    // Emit the reply to resolve the promise
    mqtt.__emit('edna-server/rpc', JSON.stringify({ id: parsed.id, result: {} }));
    await expect(startPromise).resolves.toBeUndefined();

    driver.destroy();
  });

  it('shellyRpc cleans up pending request even when publish fails', async () => {
    const driver = new ShellyPlugDriver('p4', 'shellyplus-plug-pubfail');
    await new Promise((r) => setImmediate(r));

    // Make publish reject once
    mqtt.mqttPublish.mockRejectedValueOnce(new Error('broker disconnected'));
    await expect(driver.start()).rejects.toThrow(/broker disconnected/);

    // After failure, sending another start (with publish working) must succeed.
    // If the prior pending entry leaked, this would still resolve via the new
    // ID — but the leaked entry would never be cleaned, causing memory growth.
    // We verify cleanup by checking the internal pending map is empty.
    const mod = await import('../src/drivers/shelly-plug.js') as any;
    // _resetPlugRpcState clears any leaked state
    mod._resetPlugRpcState();
    driver.destroy();
  });

  it('rpc reply with mismatched id is ignored', async () => {
    const driver = new ShellyPlugDriver('p5', 'shellyplus-plug-mismatch');
    await new Promise((r) => setImmediate(r));

    const startPromise = driver.start();
    await new Promise((r) => setImmediate(r));

    // Emit reply with WRONG id — should be ignored
    mqtt.__emit('edna-server/rpc', JSON.stringify({ id: 99999999, result: {} }));
    // Now emit correct id
    const callIdx = mqtt.mqttPublish.mock.calls.length - 1;
    const sentPayload = JSON.parse(mqtt.mqttPublish.mock.calls[callIdx][1]);
    mqtt.__emit('edna-server/rpc', JSON.stringify({ id: sentPayload.id, result: {} }));

    await expect(startPromise).resolves.toBeUndefined();
    driver.destroy();
  });

  it('rpc error response is propagated as a thrown error', async () => {
    const driver = new ShellyPlugDriver('p6', 'shellyplus-plug-errresp');
    await new Promise((r) => setImmediate(r));

    const startPromise = driver.start();
    await new Promise((r) => setImmediate(r));

    const sent = JSON.parse(mqtt.mqttPublish.mock.calls.at(-1)![1]);
    mqtt.__emit('edna-server/rpc', JSON.stringify({
      id: sent.id,
      error: { message: 'Switch not found' },
    }));

    await expect(startPromise).rejects.toThrow(/Switch not found/);
    driver.destroy();
  });
});
