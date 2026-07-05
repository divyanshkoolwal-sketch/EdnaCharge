/**
 * chaos-fast.ts — run the happy path 5× in <30s for smoke coverage.
 *
 * Assumes:
 *   - api + csms + worker are running with AUTO_DECLINE_MS=2000 (override)
 *   - `pnpm -F @edna/db seed` has produced a tier-3 charger
 *   - CHAOS_OCPP_PASSWORD is set (rotate via charger.ocppCredentials first)
 *
 * Each iteration uses --session 10s on the simulator; total target ≤ 30s.
 */
import { PrismaClient } from '@prisma/client';
import { spawn } from 'node:child_process';

const prisma = new PrismaClient();
const ITER = Number(process.env.CHAOS_FAST_ITERATIONS ?? 5);
const SESSION_SEC = Number(process.env.CHAOS_FAST_SESSION_SEC ?? 10);
const TOTAL_BUDGET_MS = 30_000;

async function waitFor(pred: () => Promise<boolean>, timeoutMs = 15_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await pred()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('waitFor timed out');
}

async function runSim(cpId: string, password: string, sessionSec: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(
      'pnpm',
      [
        '--silent',
        'sim',
        '--charger',
        cpId,
        '--session',
        `${sessionSec}s`,
        '--password',
        password,
      ],
      { stdio: 'inherit' },
    );
    proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`sim exit ${code}`))));
  });
}

async function iteration(i: number, cpId: string, password: string) {
  const t0 = Date.now();
  console.log(`[chaos-fast] iter ${i + 1}/${ITER} start`);
  await runSim(cpId, password, SESSION_SEC);
  await waitFor(async () => {
    const b = await prisma.booking.findFirst({
      where: { charger: { ocppChargePointId: cpId }, status: 'completed' },
      orderBy: { createdAt: 'desc' },
    });
    return !!b;
  });
  console.log(`[chaos-fast] iter ${i + 1} done in ${Date.now() - t0}ms`);
}

async function main() {
  const globalStart = Date.now();
  const password = process.env.CHAOS_OCPP_PASSWORD;
  if (!password) {
    console.error('CHAOS_OCPP_PASSWORD required (rotate via charger.ocppCredentials)');
    process.exit(2);
  }
  const charger = await prisma.charger.findFirst({
    where: { hardwareTier: 'tier_3_native', ocppChargePointId: { not: null } },
  });
  if (!charger) {
    console.error('No tier-3 charger seeded');
    process.exit(2);
  }
  for (let i = 0; i < ITER; i++) {
    await iteration(i, charger.ocppChargePointId!, password);
    if (Date.now() - globalStart > TOTAL_BUDGET_MS) {
      console.warn(`[chaos-fast] over budget after iter ${i + 1}`);
    }
  }
  const total = Date.now() - globalStart;
  console.log(`[chaos-fast] ${ITER} iterations in ${total}ms`);
  if (total > TOTAL_BUDGET_MS) {
    console.error(`[chaos-fast] exceeded ${TOTAL_BUDGET_MS}ms budget`);
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error('[chaos-fast] FAILED', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
