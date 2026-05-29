/**
 * Tier 1 driver — Shelly Plus Plug S / Gen3 (model: shelly-plus-plug-s).
 *
 * Communication: MQTT JSON-RPC (Shelly Gen2/Gen3 API).
 *   Commands: publish to `{shellyId}/rpc`
 *   Responses: subscribe to `{src}/rpc` (where `src` is our chosen reply topic)
 *   Status:    subscribe to `{shellyId}/status/switch:0` (auto-published by device)
 *
 * Energy unit: Shelly returns Wh in `aenergy.total`; we convert to kWh internally.
 */

import { mqttOnTopic, mqttPublish, awaitConnected } from '../lib/mqtt-client.js';
import type { ChargerDriver, MeterReading } from './base.js';
import { logger } from '../logger.js';

const RPC_SRC = 'edna-server';
const RPC_REPLY_TOPIC = `${RPC_SRC}/rpc`;

interface SwitchStatus {
  id?: number;
  output?: boolean;
  apower?: number;
  voltage?: number;
  current?: number;
  aenergy?: { total?: number };
}

/**
 * Single shared map of pending RPC requests, keyed by id. The MQTT client has
 * one global handler subscribed to `{RPC_SRC}/rpc`; on response, it looks up
 * the pending request and resolves it.
 */
const _pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
let _replyHandlerInstalled = false;
let _replyUnsubscribe: (() => void) | null = null;

async function installReplyHandler(): Promise<void> {
  if (_replyHandlerInstalled) return;
  _replyHandlerInstalled = true;
  _replyUnsubscribe = await mqttOnTopic(RPC_REPLY_TOPIC, (payload) => {
    try {
      const parsed = JSON.parse(payload.toString()) as {
        id?: number;
        result?: unknown;
        error?: { message: string };
      };
      if (parsed.id == null) return;
      const pending = _pending.get(parsed.id);
      if (!pending) return;
      _pending.delete(parsed.id);
      if (parsed.error) pending.reject(new Error(parsed.error.message));
      else pending.resolve(parsed.result);
    } catch {
      // ignore malformed
    }
  });
}

let _rpcIdCounter = 1;
function nextRpcId(): number {
  // Wrap-around-safe sequential ID; collision-free within a worker process.
  _rpcIdCounter = (_rpcIdCounter + 1) >>> 0;
  return _rpcIdCounter;
}

async function shellyRpc<T = unknown>(
  shellyId: string,
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs = 8000,
): Promise<T> {
  await awaitConnected();
  await installReplyHandler();

  const id = nextRpcId();
  const topic = `${shellyId}/rpc`;
  const payload = JSON.stringify({ id, src: RPC_SRC, method, params });

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      _pending.delete(id);
      reject(new Error(`shellyRpc timeout: ${method} on ${shellyId}`));
    }, timeoutMs);

    _pending.set(id, {
      resolve: (v) => {
        clearTimeout(timer);
        resolve(v as T);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    });

    mqttPublish(topic, payload).catch((err) => {
      _pending.delete(id);
      clearTimeout(timer);
      reject(err);
    });
  });
}

export class ShellyPlugDriver implements ChargerDriver {
  readonly deviceId: string;
  private readonly shellyId: string;
  private lastMeter: MeterReading | null = null;
  private readonly statusTopic: string;
  private statusUnsubscribe: (() => void) | null = null;

  constructor(deviceId: string, shellyId: string) {
    this.deviceId = deviceId;
    this.shellyId = shellyId;
    this.statusTopic = `${shellyId}/status/switch:0`;
    void this._initStatusSubscription();
  }

  private async _initStatusSubscription(): Promise<void> {
    try {
      this.statusUnsubscribe = await mqttOnTopic(this.statusTopic, (payload) => {
        try {
          const s = JSON.parse(payload.toString()) as SwitchStatus;
          // CRITICAL: only accept numeric fields. Reject NaN/Infinity/strings
          // — they'd corrupt billing if propagated to MeterValue / finalKwh.
          const total = s.aenergy?.total;
          const apower = s.apower;
          const kwhTotal = typeof total === 'number' && Number.isFinite(total)
            ? total / 1000
            : (this.lastMeter?.kwhTotal ?? 0);
          const powerW = typeof apower === 'number' && Number.isFinite(apower)
            ? apower
            : (this.lastMeter?.powerW ?? 0);
          this.lastMeter = { kwhTotal, powerW, timestamp: new Date() };
        } catch {
          // ignore malformed
        }
      });
    } catch (err) {
      logger.warn({ err, shellyId: this.shellyId }, 'plug: subscribe status failed');
    }
  }

  /**
   * Synchronously fetches the current switch status via RPC. Always returns a
   * fresh meter reading — caller doesn't have to wait for the next async push.
   */
  private async fetchStatus(): Promise<MeterReading> {
    const result = await shellyRpc<SwitchStatus>(this.shellyId, 'Switch.GetStatus', { id: 0 });
    const total = result.aenergy?.total;
    const apower = result.apower;
    const kwhTotal = typeof total === 'number' && Number.isFinite(total) ? total / 1000 : 0;
    const powerW = typeof apower === 'number' && Number.isFinite(apower) ? apower : 0;
    const m: MeterReading = { kwhTotal, powerW, timestamp: new Date() };
    this.lastMeter = m;
    return m;
  }

  async start(): Promise<void> {
    await shellyRpc(this.shellyId, 'Switch.Set', { id: 0, on: true });
    logger.info({ shellyId: this.shellyId }, 'plug: relay ON');
  }

  async stop(): Promise<void> {
    await shellyRpc(this.shellyId, 'Switch.Set', { id: 0, on: false });
    logger.info({ shellyId: this.shellyId }, 'plug: relay OFF');
  }

  /**
   * Return a fresh meter reading. Performs a synchronous RPC if no push status
   * has arrived yet, OR if the cached reading is older than 30s.
   */
  async getMeter(): Promise<MeterReading> {
    const stale = !this.lastMeter || Date.now() - this.lastMeter.timestamp.getTime() > 30_000;
    if (stale) {
      try {
        return await this.fetchStatus();
      } catch (err) {
        logger.warn({ err, shellyId: this.shellyId }, 'plug: fetchStatus failed; using cached');
      }
    }
    return this.lastMeter ?? { kwhTotal: 0, powerW: 0, timestamp: new Date() };
  }

  destroy(): void {
    if (this.statusUnsubscribe) {
      this.statusUnsubscribe();
      this.statusUnsubscribe = null;
    }
  }
}

/** Internal export for tests / shutdown. */
export function _resetPlugRpcState(): void {
  _pending.clear();
  if (_replyUnsubscribe) {
    _replyUnsubscribe();
    _replyUnsubscribe = null;
  }
  _replyHandlerInstalled = false;
}
