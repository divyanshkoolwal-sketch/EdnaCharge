/** Server-proxied driving ETA for one charger detail view. */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { prisma } from '@edna/db';
import { protectedProcedure } from '../../trpc.js';
import { drivingRouteEstimate } from '../../lib/mapbox.js';
import { requireUserAccess } from '../../lib/access.js';

export const routeEstimate = protectedProcedure
  .input(
    z.object({
      chargerId: z.string().uuid(),
      origin: z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      }),
    }),
  )
  .query(async ({ ctx, input }) => {
    const charger = await prisma.charger.findUnique({
      where: { id: input.chargerId },
      select: { hostId: true, published: true, lat: true, lng: true },
    });
    if (!charger || (!charger.published && charger.hostId !== ctx.userId)) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Charger not found.' });
    }
    await requireUserAccess(ctx.userId, charger.hostId === ctx.userId ? 'host' : 'driver');
    return drivingRouteEstimate(input.origin, { lat: charger.lat, lng: charger.lng });
  });
