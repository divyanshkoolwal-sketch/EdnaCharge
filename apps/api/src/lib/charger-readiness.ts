/** @file apps/api/src/lib/charger-readiness.ts. */
import { TRPCError } from '@trpc/server';

type ChargerHardware = {
  hardwareTier: string;
  ocppChargePointId?: string | null;
  ocppConnectedAt?: Date | null;
};

const DEFAULT_READY_WINDOW_MS = 5 * 60_000;

export function ocppReadyCutoff(now = new Date()): Date {
  const configured = Number(process.env.OCPP_READY_WINDOW_MS ?? DEFAULT_READY_WINDOW_MS);
  const windowMs =
    Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_READY_WINDOW_MS;
  return new Date(now.getTime() - windowMs);
}

export function assertLaunchHardwareTier(tier: string): void {
  if (tier === 'tier_3_native') return;
  throw new TRPCError({
    code: 'PRECONDITION_FAILED',
    message:
      'EdnaCharge v1 supports OCPP-native chargers only. Join the waitlist for other hardware.',
  });
}

export function isOcppReady(charger: ChargerHardware, now = new Date()): boolean {
  return (
    charger.hardwareTier === 'tier_3_native' &&
    !!charger.ocppChargePointId &&
    !!charger.ocppConnectedAt &&
    charger.ocppConnectedAt >= ocppReadyCutoff(now)
  );
}

export function assertOcppReady(charger: ChargerHardware): void {
  if (isOcppReady(charger)) return;
  throw new TRPCError({
    code: 'PRECONDITION_FAILED',
    message: 'This charger is not connected to EdnaCharge yet. Ask the host to finish OCPP setup.',
  });
}
