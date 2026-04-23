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
    // PostGIS radius query returning published chargers with computed distance.
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
    >(
      `
      select id, title, "photoUrl", lat, lng, "connectorType", "powerKw",
             "pricePerKwhCents", "pricePerHourCents", status,
             st_distance(location, st_setsrid(st_makepoint($2,$1),4326)::geography) as "distanceM"
      from "Charger"
      where published = true
        and st_dwithin(location, st_setsrid(st_makepoint($2,$1),4326)::geography, $3)
        ${filters.connectorType ? `and "connectorType" = '${filters.connectorType}'` : ''}
        ${filters.minPowerKw ? `and "powerKw" >= ${filters.minPowerKw}` : ''}
        ${filters.availableNow ? `and status = 'available'` : ''}
        ${
          filters.maxPriceCents
            ? `and ("pricePerKwhCents" is null or "pricePerKwhCents" <= ${filters.maxPriceCents})`
            : ''
        }
      order by "distanceM" asc
      limit 500
      `,
      lat,
      lng,
      radiusMeters,
    );
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
      const existing = await prisma.charger.findUniqueOrThrow({ where: { id: input.id } });
      if (existing.hostId !== ctx.userId) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      return prisma.charger.update({ where: { id: input.id }, data: input.patch });
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
