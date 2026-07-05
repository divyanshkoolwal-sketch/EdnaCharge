/** @file apps/csms/src/handlers/meter-values.ts. */
import { prisma } from '@edna/db';
import { supabase } from '../lib/supabase.js';
import { energyToWh, finiteNumber, powerToW } from './ocpp-values.js';

type SampledValue = { value: string; measurand?: string; unit?: string };
export type MeterValueEntry = { timestamp: string; sampledValue: SampledValue[] };

/**
 * Persist a MeterValues batch and broadcast each row to the session's realtime
 * topic. One channel per batch — a fresh channel per sample leaked channels. The
 * array is bounded so a compromised charger can't amplify DB writes/broadcasts.
 */
export async function recordMeterValues(
  sessionId: string,
  meterValues: MeterValueEntry[],
): Promise<void> {
  const sb = supabase();
  const channel = sb ? sb.channel(`session:${sessionId}`) : null;
  try {
    for (const mv of meterValues.slice(0, 100)) {
      const energy = mv.sampledValue.find(
        (s) => s.measurand === 'Energy.Active.Import.Register' || !s.measurand,
      );
      const power = mv.sampledValue.find((s) => s.measurand === 'Power.Active.Import');
      const voltage = mv.sampledValue.find((s) => s.measurand === 'Voltage');
      const current = mv.sampledValue.find((s) => s.measurand === 'Current.Import');
      const energyWh = energyToWh(energy);
      const powerW = powerToW(power);
      const row = await prisma.meterValue.create({
        data: {
          sessionId,
          ts: new Date(mv.timestamp),
          energyWh: energyWh != null ? Math.round(energyWh) : 0,
          powerW: powerW != null ? Math.round(powerW) : 0,
          voltageV: finiteNumber(voltage?.value),
          currentA: finiteNumber(current?.value),
        },
      });
      if (channel) await channel.send({ type: 'broadcast', event: 'meter_value', payload: row });
    }
  } finally {
    if (sb && channel) await sb.removeChannel(channel);
  }
}
