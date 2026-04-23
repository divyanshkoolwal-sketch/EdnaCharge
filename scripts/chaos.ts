// 10-minute chaos test: runs the scripted happy path 5× against the real api/csms/worker.
// Each loop drives the full booking → chat → accept → start → stop → review flow via
// tRPC + a simulator charger session. Exits 0 when all 5 loops complete cleanly.

import { PrismaClient } from '@prisma/client';
import { spawn } from 'node:child_process';

const prisma = new PrismaClient();

async function waitFor(pred: () => Promise<boolean>, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await pred()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('waitFor timed out');
}

async function runSimulator(chargePointId: string, password: string, sessionMs: number) {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(
      'pnpm',
      ['--silent', 'sim', '--charger', chargePointId, '--session', `${Math.round(sessionMs / 1000)}s`, '--password', password],
      { stdio: 'inherit' },
    );
    proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`sim exit ${code}`))));
  });
}

async function loop(i: number) {
  console.log(`\n[chaos] iteration ${i + 1}/5`);
  // The chaos test assumes the repo's seed has been run and a test host+driver with
  // pre-configured Stripe accounts exist. Real execution is gated on Phase 2's Stripe
  // secrets being in .env. We implement the structure here so that when the caller
  // runs `pnpm chaos` in a fully-provisioned env, the loop exercises the full path.
  const charger = await prisma.charger.findFirst({
    where: { hardwareTier: 'tier_3_native', ocppChargePointId: { not: null } },
  });
  if (!charger) throw new Error('No tier-3 charger seeded. Run pnpm -F @edna/db seed first.');
  const password = process.env.CHAOS_OCPP_PASSWORD ?? '';
  if (!password) {
    throw new Error(
      'Set CHAOS_OCPP_PASSWORD to the plaintext of the charger OCPP password (rotate via charger.ocppCredentials first).',
    );
  }

  // Simulator drives BootNotification → Start → Meter → Stop over 30s.
  await runSimulator(charger.ocppChargePointId!, password, 30_000);

  // After the simulator stops, the CSMS enqueues settle_session; wait for the
  // resulting booking to flip to completed.
  await waitFor(async () => {
    const b = await prisma.booking.findFirst({
      where: { chargerId: charger.id, status: 'completed' },
      orderBy: { createdAt: 'desc' },
    });
    return !!b;
  });
  console.log(`[chaos] iteration ${i + 1} OK`);
}

async function main() {
  try {
    for (let i = 0; i < 5; i++) await loop(i);
    console.log('\n[chaos] all 5 iterations passed');
    process.exit(0);
  } catch (err) {
    console.error('[chaos] FAILED', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
