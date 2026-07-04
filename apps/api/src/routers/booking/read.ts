/** Read-only booking list and lookup procedures. */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { BookingStatus, prisma } from '@edna/db';
import { protectedProcedure } from '../../trpc.js';
import { safeChargerSelect } from '../../lib/charger-payload.js';
import { requireBookingParty } from './helpers.js';
import { requireUserAccess } from '../../lib/access.js';

export const listBookings = protectedProcedure
  .input(
    z.object({
      role: z.enum(['driver', 'host']),
      status: z.nativeEnum(BookingStatus).optional(),
      cursor: z.string().uuid().optional(),
    }),
  )
  .query(async ({ ctx, input }) => {
    await requireUserAccess(ctx.userId, input.role);
    const where =
      input.role === 'driver'
        ? { driverId: ctx.userId, ...(input.status ? { status: input.status } : {}) }
        : { charger: { hostId: ctx.userId }, ...(input.status ? { status: input.status } : {}) };
    const rows = await prisma.booking.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 26,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      include: {
        charger: { select: safeChargerSelect },
        reviews: { where: { authorId: ctx.userId } },
      },
    });
    const page = rows.slice(0, 25);
    return {
      rows: page,
      nextCursor: rows.length > 25 ? (page.at(-1)?.id ?? null) : null,
    };
  });

export const getBooking = protectedProcedure
  .input(z.object({ id: z.string().uuid() }))
  .query(async ({ ctx, input }) => {
    const b = await requireBookingParty(input.id, ctx.userId);
    await requireUserAccess(ctx.userId, b.driverId === ctx.userId ? 'driver' : 'host');
    return prisma.booking.findUniqueOrThrow({
      where: { id: b.id },
      include: {
        charger: { select: safeChargerSelect },
        session: true,
        chatThread: true,
        driver: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    });
  });

export const bookingBySessionId = protectedProcedure
  .input(z.object({ sessionId: z.string().uuid() }))
  .query(async ({ ctx, input }) => {
    const session = await prisma.chargingSession.findUniqueOrThrow({
      where: { id: input.sessionId },
      include: { booking: { include: { charger: { select: safeChargerSelect } } } },
    });
    if (session.booking.driverId !== ctx.userId && session.booking.charger.hostId !== ctx.userId) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
    await requireUserAccess(
      ctx.userId,
      session.booking.driverId === ctx.userId ? 'driver' : 'host',
    );
    return session;
  });
