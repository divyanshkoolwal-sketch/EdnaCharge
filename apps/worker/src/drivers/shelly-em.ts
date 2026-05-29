/**
 * Tier 2 driver — Shelly Pro EM-50 (model: shelly-pro-em-50).
 *
 * Two single-phase CT clamp components published as `em1:0` and `em1:1`.
 * Each em1 component reports `act_power` (W) and `total_act_energy` (Wh)
 * for ONE phase. Total power = leg0 + leg1; total energy = leg0 + leg1.
 *
 * Monitoring-only — no relay. start() / stop() are no-ops.
 *
 * Reference: Shelly EM1.GetStatus / em1:N status push payload.
 */

import { mqttOnTopic } from '../lib/mqtt-client.js';
import type { ChargerDriver, MeterReading } from './base.js';
import { logger } from '../logger.js';

interface Em1Status {
  id?: number;
  act_power?: number;        // W (single phase)
  aprt_power?: number;       // VA
  current?: number;          // A
  voltage?: number;          // V
  pf?: number;               // power factor
  freq?: number;             // Hz
  total_act_energy?: number; // Wh, cumulative
  total_act_ret_energy?: number;
}

export class ShellyEmDriver implements ChargerDriver {
  readonly deviceId: string;
  private readonly shellyId: string;
  private legPowerW: [number, number] = [0, 0];
  private legEnergyWh: [number, number] = [0, 0];
  private lastTs: Date | null = null;
  private unsubs: Array<() => void> = [];

  constructor(deviceId: string, shellyId: string) {
    this.deviceId = deviceId;
    this.shellyId = shellyId;
    void this._initStatusSubscription();
  }

  private async _initStatusSubscription(): Promise<void> {
    try {
      for (const leg of [0, 1] as const) {
        const topic = `${this.shellyId}/status/em1:${leg}`;
        const unsub = await mqttOnTopic(topic, (payload) => {
          try {
            const s = JSON.parse(payload.toString()) as Em1Status;
            // CRITICAL: only accept numeric fields. Devices can send strings
            // ("nan", "inf") on hardware faults — coercing those into our
            // power totals would corrupt billing readings.
            if (typeof s.act_power === 'number' && Number.isFinite(s.act_power)) {
              this.legPowerW[leg] = s.act_power;
            }
            if (typeof s.total_act_energy === 'number' && Number.isFinite(s.total_act_energy)) {
              this.legEnergyWh[leg] = s.total_act_energy;
            }
            this.lastTs = new Date();
          } catch {
            // ignore malformed
          }
        });
        this.unsubs.push(unsub);
      }
    } catch (err) {
      logger.warn({ err, shellyId: this.shellyId }, 'em: subscribe status failed');
    }
  }

  /** Monitoring-only — no physical control. */
  async start(): Promise<void> {
    logger.debug({ shellyId: this.shellyId }, 'em: start (no-op — monitoring only)');
  }

  /** Monitoring-only — no physical control. */
  async stop(): Promise<void> {
    logger.debug({ shellyId: this.shellyId }, 'em: stop (no-op — monitoring only)');
  }

  async getMeter(): Promise<MeterReading> {
    const powerW = this.legPowerW[0] + this.legPowerW[1];
    const totalEnergyWh = this.legEnergyWh[0] + this.legEnergyWh[1];
    return {
      kwhTotal: totalEnergyWh / 1000,
      powerW,
      timestamp: this.lastTs ?? new Date(),
    };
  }

  /** True if we've received at least one status message. */
  get hasReading(): boolean {
    return this.lastTs !== null;
  }

  destroy(): void {
    for (const u of this.unsubs) u();
    this.unsubs = [];
  }
}
