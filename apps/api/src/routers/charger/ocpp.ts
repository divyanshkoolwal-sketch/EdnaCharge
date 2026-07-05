/** OCPP connection-state and credential procedures for host chargers. */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@edna/db';
import { protectedProcedure } from '../../trpc.js';
import { requireUserAccess } from '../../lib/access.js';

export const connectionStatus = protectedProcedure
  .input(z.object({ id: z.string().uuid() }))
  .query(async ({ ctx, input }) => {
    await requireUserAccess(ctx.userId, 'host');
    const c = await prisma.charger.findUniqueOrThrow({
      where: { id: input.id },
      select: { hostId: true, ocppConnectedAt: true, status: true, ocppChargePointId: true },
    });
    if (c.hostId !== ctx.userId) throw new TRPCError({ code: 'FORBIDDEN' });
    return {
      connected: c.ocppConnectedAt != null,
      lastConnectedAt: c.ocppConnectedAt,
      status: c.status,
      provisioned: c.ocppChargePointId != null,
    };
  });

export const connectionDetails = protectedProcedure
  .input(z.object({ id: z.string().uuid() }))
  .query(async ({ ctx, input }) => {
    await requireUserAccess(ctx.userId, 'host');
    const c = await prisma.charger.findUniqueOrThrow({
      where: { id: input.id },
      select: { hostId: true, hardwareTier: true, ocppChargePointId: true, ocppSecretEnc: true },
    });
    if (c.hostId !== ctx.userId) throw new TRPCError({ code: 'FORBIDDEN' });
    if (c.hardwareTier !== 'tier_3_native') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'OCPP only for Tier 3.' });
    }
    if (!c.ocppSecretEnc) throw missingCredentialsError();

    const rows = await prisma.$queryRaw<Array<{ password: string | null }>>`
      SELECT pgp_sym_decrypt(decode("ocppSecretEnc", 'base64'), ${ocppEncKey()}) AS password
      FROM "Charger" WHERE id = ${input.id}::uuid
    `;
    const password = rows[0]?.password;
    if (!password) throw missingCredentialsError();
    return {
      wssUrl: `${csmsPublicBase()}/ocpp/v1.6/${c.ocppChargePointId}`,
      chargePointId: c.ocppChargePointId!,
      password,
    };
  });

export const regenerateOcppCredentials = protectedProcedure
  .input(z.object({ id: z.string().uuid() }))
  .mutation(async ({ ctx, input }) => {
    await requireUserAccess(ctx.userId, 'host');
    const c = await prisma.charger.findUniqueOrThrow({ where: { id: input.id } });
    if (c.hostId !== ctx.userId) throw new TRPCError({ code: 'FORBIDDEN' });
    if (c.hardwareTier !== 'tier_3_native') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'OCPP only for Tier 3.' });
    }
    const password = randomBytes(24).toString('hex');
    const hash = await bcrypt.hash(password, 10);
    await prisma.charger.update({ where: { id: c.id }, data: { ocppAuthHash: hash } });
    await prisma.$executeRaw`UPDATE "Charger" SET "ocppSecretEnc" = encode(pgp_sym_encrypt(${password}, ${ocppEncKey()}), 'base64') WHERE id = ${c.id}::uuid`;
    return {
      wssUrl: `${csmsPublicBase()}/ocpp/v1.6/${c.ocppChargePointId}`,
      chargePointId: c.ocppChargePointId!,
      password,
    };
  });

function csmsPublicBase(): string {
  return process.env.CSMS_PUBLIC_URL ?? 'ws://localhost:3100';
}

function ocppEncKey(): string {
  const k = process.env.OCPP_SECRET_ENC_KEY;
  if (!k) {
    throw new TRPCError({
      code: 'SERVICE_UNAVAILABLE',
      message: 'OCPP credential encryption key not configured.',
    });
  }
  return k;
}

function missingCredentialsError() {
  return new TRPCError({
    code: 'PRECONDITION_FAILED',
    message: 'No credentials yet — tap “Regenerate credentials”.',
  });
}
