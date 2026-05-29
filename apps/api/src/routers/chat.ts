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
          booking: {
            include: {
              charger: { include: { host: { select: { id: true, fullName: true, avatarUrl: true } } } },
              driver: { select: { id: true, fullName: true, avatarUrl: true } },
            },
          },
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
          booking: {
            include: {
              charger: { include: { host: { select: { id: true, fullName: true, avatarUrl: true } } } },
              driver: { select: { id: true, fullName: true, avatarUrl: true } },
            },
          },
          // Bound the history: fetch the most recent 200 messages, then return
          // them ascending for the UI. Prevents an unbounded payload on a
          // long-lived thread.
          messages: { orderBy: { createdAt: 'desc' }, take: 200 },
        },
      });
      if (
        thread.booking.driverId !== ctx.userId &&
        thread.booking.charger.hostId !== ctx.userId
      ) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      thread.messages.reverse();
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
    // AUDIT M3: honor upToMessageId. UUIDs aren't monotonic, so we look up the
    // message's createdAt and mark read only counterparty messages <= that
    // timestamp — avoids marking unseen later-arriving messages as read.
    const upTo = await prisma.chatMessage.findUnique({
      where: { id: input.upToMessageId },
      select: { createdAt: true, threadId: true },
    });
    if (!upTo || upTo.threadId !== input.threadId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'upToMessageId does not belong to this thread.',
      });
    }
    const now = new Date();
    await prisma.chatMessage.updateMany({
      where: {
        threadId: input.threadId,
        senderId: { not: ctx.userId },
        readAt: null,
        createdAt: { lte: upTo.createdAt },
      },
      data: { readAt: now },
    });
    return { at: now };
  }),
});
