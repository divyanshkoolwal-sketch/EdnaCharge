/** @file apps/api/src/routers/charger.ts. */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { router, protectedProcedure } from '../trpc.js';
import { prisma } from '@edna/db';
import {
  ChargerCreateInputZ,
  ChargerUpdateInputZ,
  NearbyInputZ,
  ChargerWaitlistInputZ,
  demandRateCents,
} from '@edna/schemas';
import { hostOwnedChargerSelect, safeChargerWithHostSelect } from '../lib/charger-payload.js';
import { connectionDetails, connectionStatus, regenerateOcppCredentials } from './charger/ocpp.js';
import {
  assertLaunchHardwareTier,
  assertOcppReady,
  ocppReadyCutoff,
} from '../lib/charger-readiness.js';
import { validateAddressPin } from '../lib/mapbox.js';
import { routeEstimate } from './charger/route-estimate.js';
import { requireUserAccess } from '../lib/access.js';

async function assertHost(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { identityVerification: true },
  });
  if (!user.roles.includes('host')) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Finish setting up payouts (Stripe) before listing a charger.',
    });
  }
  // Identity-verification gate. Hosts can browse the app freely but must be
  // verified before listing their first charger.
  if (user.identityVerification?.status !== 'verified') {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Verify your ID before listing a charger.',
    });
  }
}

async function hostOwnedChargerResponse(id: string) {
  const row = await prisma.charger.findUniqueOrThrow({
    where: { id },
    select: hostOwnedChargerSelect,
  });
  return { ...row, currentRateCents: demandRateCents(new Date()) };
}

export const chargerRouter = router({
  nearby: protectedProcedure.input(NearbyInputZ).query(async ({ ctx, input }) => {
    await requireUserAccess(ctx.userId, 'driver');
    const { lat, lng, radiusMeters, filters } = input;
    // Pricing is demand-based and uniform across chargers at a given instant, so
    // a driver's max-price filter is evaluated against the current demand rate,
    // NOT the (now-unused, null-for-new-chargers) stored price column. If the
    // current rate already exceeds the cap, nothing qualifies.
    const currentRateCents = demandRateCents(new Date());
    if (typeof filters.maxPriceCents === 'number' && currentRateCents > filters.maxPriceCents) {
      return [];
    }
    // All filter values are bound as positional parameters. connectorType is
    // enum-validated upstream, and binding keeps the SQL path safe if validation changes.
    const params: unknown[] = [lat, lng, radiusMeters];
    const conds: string[] = [
      `published = true`,
      `st_dwithin(location, st_setsrid(st_makepoint($2,$1),4326)::geography, $3)`,
    ];
    conds.push(`"hardwareTier" = 'tier_3_native'`);
    params.push(ocppReadyCutoff());
    conds.push(`"ocppConnectedAt" >= $${params.length}`);
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
    // maxPriceCents is handled above against the demand rate (uniform), so no
    // per-charger price predicate here.
    const sql = `
      select id, title, "photoUrl", lat, lng, "connectorType", "powerKw",
             "pricePerKwhCents", "pricePerHourCents", status,
             st_distance(location, st_setsrid(st_makepoint($2,$1),4326)::geography) as "distanceM"
      from "Charger"
      where ${conds.join(' and ')}
      order by "distanceM" asc, id asc
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
    // Attach the current demand rate (computed above) so the map/list shows a
    // live $/kWh instead of a stale host-entered number.
    return rows.map((r) => ({ ...r, currentRateCents }));
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const c = await prisma.charger.findUniqueOrThrow({
        where: { id: input.id },
        select: safeChargerWithHostSelect,
      });
      // IDOR guard: an unpublished/delisted charger is only visible to its
      // owner. Otherwise anyone with the id could read a hidden charger.
      if (!c.published && c.hostId !== ctx.userId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Charger not found.' });
      }
      const isOwner = c.hostId === ctx.userId;
      await requireUserAccess(ctx.userId, isOwner ? 'host' : 'driver');
      const reviews = await prisma.review.findMany({
        where: { subjectId: c.hostId, hiddenAt: null },
        take: 3,
        orderBy: { createdAt: 'desc' },
      });
      // Return the gate code ONLY to the owner (never to drivers) so the host's
      // edit screen can display/change it — it's omitted from the driver-safe
      // select above. undefined for non-owners keeps it off the wire.
      const gateCode = isOwner
        ? ((await prisma.charger.findUnique({ where: { id: c.id }, select: { gateCode: true } }))
            ?.gateCode ?? null)
        : undefined;
      // Demand-based rate is computed server-side, not host-entered.
      return { ...c, gateCode, currentRateCents: demandRateCents(new Date()), hostReviews: reviews };
    }),

  myChargers: protectedProcedure.query(async ({ ctx }) => {
    await requireUserAccess(ctx.userId, 'host');
    const rows = await prisma.charger.findMany({
      where: { hostId: ctx.userId },
      select: hostOwnedChargerSelect,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const currentRateCents = demandRateCents(new Date());
    return rows.map((row) => ({ ...row, currentRateCents }));
  }),

  create: protectedProcedure.input(ChargerCreateInputZ).mutation(async ({ ctx, input }) => {
    await requireUserAccess(ctx.userId, 'host');
    await assertHost(ctx.userId);
    assertLaunchHardwareTier(input.hardwareTier);
    await validateAddressPin(input);
    const charger = await prisma.charger.create({
      data: { ...input, hostId: ctx.userId, published: false, status: 'offline' },
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
      // Store the password encrypted so the host can re-view the same creds
      // without rotating them. Best-effort: if the enc key isn't set in local
      // dev, skip; `connectionDetails` prompts a regenerate.
      const encKey = process.env.OCPP_SECRET_ENC_KEY;
      if (encKey) {
        await prisma.$executeRaw`UPDATE "Charger" SET "ocppSecretEnc" = encode(pgp_sym_encrypt(${password}, ${encKey}), 'base64') WHERE id = ${charger.id}::uuid`;
      }
    }
    return hostOwnedChargerResponse(charger.id);
  }),

  update: protectedProcedure.input(ChargerUpdateInputZ).mutation(async ({ ctx, input }) => {
    await requireUserAccess(ctx.userId, 'host');
    const current = await prisma.charger.findFirstOrThrow({
      where: { id: input.id, hostId: ctx.userId },
    });
    assertLaunchHardwareTier(input.patch.hardwareTier ?? current.hardwareTier);
    const next = { ...current, ...input.patch };
    if (
      input.patch.addressLine1 ||
      input.patch.city ||
      input.patch.state ||
      input.patch.postalCode ||
      input.patch.country ||
      input.patch.lat != null ||
      input.patch.lng != null
    ) {
      await validateAddressPin(next);
    }
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
    return hostOwnedChargerResponse(input.id);
  }),

  // Soft-unlist: take the pin off the driver map without deleting the row
  // (which would cascade-delete bookings + receipts). Only the host who owns
  // the charger may unlist.
  unlist: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireUserAccess(ctx.userId, 'host');
      const res = await prisma.charger.updateMany({
        where: { id: input.id, hostId: ctx.userId },
        data: { published: false, status: 'offline' },
      });
      if (res.count !== 1) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Charger not found or not owned.' });
      }
      return hostOwnedChargerResponse(input.id);
    }),

  // Host-controlled online/offline toggle. Online makes the charger visible on
  // the driver map (published=true, status=available); offline removes it
  // (published=false, status=offline). Existing bookings remain referenceable
  // either way — we never delete the row.
  setOnline: protectedProcedure
    .input(z.object({ id: z.string().uuid(), online: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await requireUserAccess(ctx.userId, 'host');
      const charger = await prisma.charger.findFirst({
        where: { id: input.id, hostId: ctx.userId },
      });
      if (!charger) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Charger not found or not owned.' });
      }
      if (input.online) {
        assertLaunchHardwareTier(charger.hardwareTier);
        assertOcppReady(charger);
      }
      const res = await prisma.charger.updateMany({
        where: { id: input.id, hostId: ctx.userId },
        data: input.online
          ? { published: true, status: 'available' }
          : { published: false, status: 'offline' },
      });
      if (res.count !== 1) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Charger not found or not owned.' });
      }
      return hostOwnedChargerResponse(input.id);
    }),

  connectionStatus,
  connectionDetails,
  regenerateOcppCredentials,
  routeEstimate,

  // v1 is OCPP-only. Hosts whose charger can't connect to our CSMS record their
  // interest here instead of listing a charger that could never go live.
  joinWaitlist: protectedProcedure.input(ChargerWaitlistInputZ).mutation(async ({ ctx, input }) => {
    await requireUserAccess(ctx.userId, 'host');
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: ctx.userId },
      select: { email: true },
    });
    return prisma.chargerWaitlist.upsert({
      where: { userId: ctx.userId },
      create: {
        userId: ctx.userId,
        email: user.email,
        chargerBrand: input.chargerBrand,
        note: input.note,
        status: 'open',
      },
      update: {
        email: user.email,
        chargerBrand: input.chargerBrand,
        note: input.note,
        status: 'open',
      },
    });
  }),
});
