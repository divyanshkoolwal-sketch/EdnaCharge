import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { router, protectedProcedure } from '../trpc.js';
import { prisma } from '@edna/db';
import { ChargerCreateInputZ, ChargerUpdateInputZ, NearbyInputZ } from '@edna/schemas';

async function assertHost(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.roles.includes('host')) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a host.' });
  }
}

export const chargerRouter = router({
  nearby: protectedProcedure.input(NearbyInputZ).query(async ({ input }) => {
    const { lat, lng, radiusMeters, filters } = input;
    // AUDIT C1: all filter values are bound as positional parameters — no string
    // interpolation of user input into raw SQL. connectorType is enum-validated
    // by zod upstream, but parameterizing it removes the injection surface even
    // if validation is relaxed later.
    const params: unknown[] = [lat, lng, radiusMeters];
    const conds: string[] = [
      `published = true`,
      `st_dwithin(location, st_setsrid(st_makepoint($2,$1),4326)::geography, $3)`,
    ];
    if (filters.connectorType) {
      params.push(filters.connectorType);
      conds.push(`"connectorType"::text = $${params.length}`);
    }
    if (typeof filters.minPowerKw === 'number') {
      params.push(filters.minPowerKw);
      conds.push(`"powerKw" >= $${params.length}`);
    }
    if (filters.availableNow) {
      conds.push(`status = 'available'`);
    }
    if (typeof filters.maxPriceCents === 'number') {
      params.push(filters.maxPriceCents);
      conds.push(
        `("pricePerKwhCents" is null or "pricePerKwhCents" <= $${params.length})`,
      );
    }
    const sql = `
      select id, title, "photoUrl", lat, lng, "connectorType", "powerKw",
             "pricePerKwhCents", "pricePerHourCents", status,
             st_distance(location, st_setsrid(st_makepoint($2,$1),4326)::geography) as "distanceM"
      from "Charger"
      where ${conds.join(' and ')}
      order by "distanceM" asc
      limit 500
    `;
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        title: string;
        photoUrl: string | null;
        lat: number;
        lng: number;
        connectorType: string;
        powerKw: number;
        pricePerKwhCents: number | null;
        pricePerHourCents: number | null;
        status: string;
        distanceM: number;
      }>
    >(sql, ...params);
    return rows;
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const c = await prisma.charger.findUniqueOrThrow({
        where: { id: input.id },
        include: {
          host: { select: { id: true, fullName: true, avatarUrl: true } },
        },
      });
      const reviews = await prisma.review.findMany({
        where: { subjectId: c.hostId },
        take: 3,
        orderBy: { createdAt: 'desc' },
      });
      return { ...c, hostReviews: reviews };
    }),

  myChargers: protectedProcedure.query(async ({ ctx }) => {
    return prisma.charger.findMany({
      where: { hostId: ctx.userId },
      orderBy: { createdAt: 'desc' },
    });
  }),

  create: protectedProcedure
    .input(ChargerCreateInputZ)
    .mutation(async ({ ctx, input }) => {
      await assertHost(ctx.userId);
      const charger = await prisma.charger.create({
        data: { ...input, hostId: ctx.userId, published: true, status: 'available' },
      });
      // Tier 3 chargers get OCPP credentials materialized at creation time.
      if (input.hardwareTier === 'tier_3_native') {
        const password = randomBytes(24).toString('hex');
        const hash = await bcrypt.hash(password, 10);
        await prisma.charger.update({
          where: { id: charger.id },
          data: {
            ocppChargePointId: `cp-${charger.id.slice(0, 8)}`,
            ocppAuthHash: hash,
          },
        });
      }
      return charger;
    }),

  update: protectedProcedure
    .input(ChargerUpdateInputZ)
    .mutation(async ({ ctx, input }) => {
      // AUDIT H5: collapse TOCTOU check into a single updateMany guarded on
      // hostId. If ownership changed between read and write, count === 0 and
      // we report NOT_FOUND (rather than an out-of-date FORBIDDEN).
      const res = await prisma.charger.updateMany({
        where: { id: input.id, hostId: ctx.userId },
        data: input.patch,
      });
      if (res.count !== 1) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Charger not found or not owned.' });
      }
      return prisma.charger.findUniqueOrThrow({ where: { id: input.id } });
    }),

  // Soft-unlist: take the pin off the driver map without deleting the row
  // (which would cascade-delete bookings + receipts). Only the host who owns
  // the charger may unlist.
  unlist: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const res = await prisma.charger.updateMany({
        where: { id: input.id, hostId: ctx.userId },
        data: { published: false, status: 'offline' },
      });
      if (res.count !== 1) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Charger not found or not owned.' });
      }
      return prisma.charger.findUniqueOrThrow({ where: { id: input.id } });
    }),

  ocppCredentials: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const c = await prisma.charger.findUniqueOrThrow({ where: { id: input.id } });
      if (c.hostId !== ctx.userId) throw new TRPCError({ code: 'FORBIDDEN' });
      if (c.hardwareTier !== 'tier_3_native') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'OCPP only for Tier 3.' });
      }
      const password = randomBytes(24).toString('hex');
      const hash = await bcrypt.hash(password, 10);
      await prisma.charger.update({
        where: { id: c.id },
        data: { ocppAuthHash: hash },
      });
      const csmsBase = process.env.CSMS_PUBLIC_URL ?? 'wss://csms.ednacharge.com';
      return {
        wssUrl: `${csmsBase}/ocpp/v1.6/${c.ocppChargePointId}`,
        chargePointId: c.ocppChargePointId!,
        password,
      };
    }),
});
