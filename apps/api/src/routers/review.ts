import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { prisma } from '@edna/db';
import { CreateReviewInputZ } from '@edna/schemas';
import { notificationsQueue } from '../lib/queues.js';

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
    const subjectId = ctx.userId === driverId ? hostId : driverId;
    if (b.status !== 'completed') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Booking not completed.' });
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

  forUser: protectedProcedure
    .input(z.object({ userId: z.string().uuid(), cursor: z.string().uuid().optional() }))
    .query(async ({ input }) => {
      const rows = await prisma.review.findMany({
        where: { subjectId: input.userId },
        orderBy: { createdAt: 'desc' },
        take: 25,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });
      return { rows, nextCursor: rows.at(-1)?.id ?? null };
    }),
});
