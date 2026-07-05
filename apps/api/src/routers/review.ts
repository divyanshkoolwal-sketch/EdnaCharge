/** @file apps/api/src/routers/review.ts. */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { prisma } from '@edna/db';
import { CreateReviewInputZ } from '@edna/schemas';
import { notificationsQueue } from '../lib/queues.js';
import { requireAnyUserAccess, requireUserAccess } from '../lib/access.js';

export const reviewRouter = router({
  create: protectedProcedure.input(CreateReviewInputZ).mutation(async ({ ctx, input }) => {
    const b = await prisma.booking.findUniqueOrThrow({
      where: { id: input.bookingId },
      include: { charger: true },
    });
    const hostId = b.charger.hostId;
    const driverId = b.driverId;
    if (ctx.userId !== hostId && ctx.userId !== driverId) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
    await requireUserAccess(ctx.userId, ctx.userId === driverId ? 'driver' : 'host');
    const subjectId = ctx.userId === driverId ? hostId : driverId;
    // Defense-in-depth against a self-booking (host booking their own charger):
    // never let someone review themselves and inflate their own rating.
    if (subjectId === ctx.userId || hostId === driverId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'You cannot review your own booking.' });
    }
    if (b.status !== 'completed') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Booking not completed.' });
    }
    // AUDIT M2: check for existing review up front and surface a friendly error
    // instead of letting Prisma throw a generic P2002 that surfaces as a 500.
    const existing = await prisma.review.findUnique({
      where: { bookingId_authorId: { bookingId: b.id, authorId: ctx.userId } },
    });
    if (existing) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'You have already reviewed this booking.',
      });
    }
    const review = await prisma.review.create({
      data: {
        bookingId: b.id,
        authorId: ctx.userId,
        subjectId,
        stars: input.stars,
        text: input.text,
      },
    });
    await notificationsQueue.add('review_left', { userId: subjectId, bookingId: b.id });
    return review;
  }),

  // The caller's own review for a booking (or null). Lets the receipt/host
  // review screens render an already-submitted state instead of letting a
  // second `create` fail with a CONFLICT.
  mine: protectedProcedure
    .input(z.object({ bookingId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireAnyUserAccess(ctx.userId);
      return prisma.review.findUnique({
        where: { bookingId_authorId: { bookingId: input.bookingId, authorId: ctx.userId } },
      });
    }),

  forUser: protectedProcedure
    .input(z.object({ userId: z.string().uuid(), cursor: z.string().uuid().optional() }))
    .query(async ({ input }) => {
      const PAGE = 25;
      const rows = await prisma.review.findMany({
        where: { subjectId: input.userId, hiddenAt: null },
        orderBy: { createdAt: 'desc' },
        take: PAGE,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        include: {
          // Who left the rating — so the "your ratings" list can show a name/avatar.
          author: { select: { id: true, fullName: true, avatarUrl: true } },
        },
      });
      // Only advertise a next cursor when a FULL page came back; otherwise this
      // is the last page. Returning the last id unconditionally makes pagination
      // never terminate (the client keeps requesting empty pages).
      const nextCursor = rows.length === PAGE ? (rows.at(-1)?.id ?? null) : null;
      return { rows, nextCursor };
    }),

  // Aggregate rating + count for a user. Used by mobile screens that show
  // "4.8 ★" next to a name. Returns avg=null + count=0 for new users so the
  // UI can render "New" instead of fabricating a fake number.
  summary: protectedProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .query(async ({ input }) => {
      const agg = await prisma.review.aggregate({
        where: { subjectId: input.userId, hiddenAt: null },
        _avg: { stars: true },
        _count: { _all: true },
      });
      return {
        avg: agg._avg.stars,
        count: agg._count._all,
      };
    }),
});
