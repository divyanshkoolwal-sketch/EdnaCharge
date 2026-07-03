import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { prisma } from '@edna/db';

const PAGE = 25;

export const notificationRouter = router({
  // Cursor-paginated feed, newest first. Each row carries a deep-link id
  // (bookingId / threadId / sessionId) so the client can route on tap.
  list: protectedProcedure
    .input(z.object({ cursor: z.string().uuid().optional() }))
    .query(async ({ ctx, input }) => {
      const rows = await prisma.notification.findMany({
        where: { userId: ctx.userId },
        orderBy: { createdAt: 'desc' },
        take: PAGE,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });
      return { rows, nextCursor: rows.length === PAGE ? (rows.at(-1)?.id ?? null) : null };
    }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    return prisma.notification.count({ where: { userId: ctx.userId, readAt: null } });
  }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    await prisma.notification.updateMany({
      where: { userId: ctx.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true as const };
  }),

  markRead: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Scoped to the caller so a user can't mark someone else's row read.
      await prisma.notification.updateMany({
        where: { id: input.id, userId: ctx.userId },
        data: { readAt: new Date() },
      });
      return { ok: true as const };
    }),
});
