/** @file apps/csms/src/handlers/charger-liveness.ts. */
import { prisma } from '@edna/db';
import { logger } from '../logger.js';

/**
 * Refresh a charger's OCPP liveness timestamp. The API treats `ocppConnectedAt`
 * as a heartbeat with a 5-minute freshness cutoff (charger-readiness.ts), so a
 * charger that only stamped it at socket-open would fall out of search and become
 * un-startable after 5 minutes. Best-effort — a DB blip must not drop the session.
 */
export async function touchOcppConnectedAt(cpId: string): Promise<void> {
  try {
    await prisma.charger.updateMany({
      where: { ocppChargePointId: cpId },
      data: { ocppConnectedAt: new Date() },
    });
  } catch (err) {
    logger.warn({ cpId, err }, 'failed to refresh ocppConnectedAt');
  }
}
