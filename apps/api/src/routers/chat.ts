import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { prisma } from '@edna/db';
import { SendMessageInputZ, MarkReadInputZ } from '@edna/schemas';
import { notificationsQueue } from '../lib/queues.js';

async function assertThreadParty(threadId: string, userId: string) {
  const t = await prisma.chatThread.findUniqueOrThrow({
    where: { id: threadId },
    include: { booking: { include: { charger: true } } },
  });
  const hostId = t.booking.charger.hostId;
  if (t.booking.driverId !== userId && hostId !== userId) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return { thread: t, counterpartyId: t.booking.driverId === userId ? hostId : t.booking.driverId };
}

export const chatRouter = router({
  listThreads: protectedProcedure
    .input(z.object({ cursor: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const threads = await prisma.chatThread.findMany({
        where: {
          OR: [
            { booking: { driverId: ctx.userId } },
            { booking: { charger: { hostId: ctx.userId } } },
          ],
        },
        include: {
          booking: { include: { charger: true } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
        orderBy: { createdAt: 'desc' },
        take: 25,
        ...(input?.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });
      return threads;
    }),

  getThread: protectedProcedure
    .input(z.object({ bookingId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const thread = await prisma.chatThread.findUniqueOrThrow({
        where: { bookingId: input.bookingId },
        include: {
          booking: { include: { charger: true } },
          messages: { orderBy: { createdAt: 'asc' } },
        },
      });
      if (
        thread.booking.driverId !== ctx.userId &&
        thread.booking.charger.hostId !== ctx.userId
      ) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      return thread;
    }),

  sendMessage: protectedProcedure.input(SendMessageInputZ).mutation(async ({ ctx, input }) => {
    const { thread, counterpartyId } = await assertThreadParty(input.threadId, ctx.userId);
    if (thread.closedAt) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Thread is read-only.' });
    }
    const message = await prisma.chatMessage.create({
      data: { threadId: thread.id, senderId: ctx.userId, kind: 'text', body: input.body },
    });
    await notificationsQueue.add('new_chat_message', {
      userId: counterpartyId,
      threadId: thread.id,
      preview: input.body.slice(0, 80),
    });
    return message;
  }),

  markRead: protectedProcedure.input(MarkReadInputZ).mutation(async ({ ctx, input }) => {
    await assertThreadParty(input.threadId, ctx.userId);
    const now = new Date();
    await prisma.chatMessage.updateMany({
      where: {
        threadId: input.threadId,
        senderId: { not: ctx.userId },
        readAt: null,
      },
      data: { readAt: now },
    });
    return { at: now };
  }),
});
