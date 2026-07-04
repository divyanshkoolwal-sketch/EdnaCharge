/** @file apps/api/src/routers/chat.ts. */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { prisma } from '@edna/db';
import { SendMessageInputZ, MarkReadInputZ } from '@edna/schemas';
import { notificationsQueue } from '../lib/queues.js';
import { chatChargerSelect } from '../lib/charger-payload.js';
import { requireAnyUserAccess } from '../lib/access.js';

function scopeGateCodeToBookingParty<
  T extends {
    booking: {
      driverId: string;
      status: string;
      charger: { hostId: string; gateCode: string | null };
    };
  },
>(thread: T, userId: string) {
  const { gateCode, ...charger } = thread.booking.charger;
  const hostCanSee = thread.booking.charger.hostId === userId;
  const confirmedDriverCanSee =
    thread.booking.driverId === userId &&
    ['confirmed', 'active', 'completed'].includes(thread.booking.status);
  return {
    ...thread,
    booking: {
      ...thread.booking,
      charger: {
        ...charger,
        gateCode: hostCanSee || confirmedDriverCanSee ? gateCode : null,
      },
    },
  };
}

async function assertThreadParty(threadId: string, userId: string) {
  const t = await prisma.chatThread.findUniqueOrThrow({
    where: { id: threadId },
    include: { booking: { include: { charger: { select: { hostId: true } } } } },
  });
  const hostId = t.booking.charger.hostId;
  if (t.booking.driverId !== userId && hostId !== userId) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return { thread: t, counterpartyId: t.booking.driverId === userId ? hostId : t.booking.driverId };
}

async function assertUsersCanMessage(userId: string, counterpartyId: string) {
  const block = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: userId, blockedId: counterpartyId },
        { blockerId: counterpartyId, blockedId: userId },
      ],
    },
    select: { blockerId: true },
  });
  if (block) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Messaging is unavailable because one of you blocked the other user.',
    });
  }
}

export const chatRouter = router({
  listThreads: protectedProcedure.query(async ({ ctx }) => {
    await requireAnyUserAccess(ctx.userId);
    const idRows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT t.id
      FROM "ChatThread" t
      JOIN "Booking" b ON b.id = t."bookingId"
      JOIN "Charger" c ON c.id = b."chargerId"
      LEFT JOIN "ChatMessage" m ON m."threadId" = t.id
      WHERE (
        b."driverId" = CAST(${ctx.userId} AS uuid)
        OR c."hostId" = CAST(${ctx.userId} AS uuid)
      )
      GROUP BY t.id, t."createdAt"
      ORDER BY COALESCE(MAX(m."createdAt"), t."createdAt") DESC, t.id DESC
      LIMIT 100
    `;

    const visibleIds = idRows.map((row) => row.id);
    const threads = await prisma.chatThread.findMany({
      where: { id: { in: visibleIds } },
      include: {
        booking: {
          include: {
            charger: { select: chatChargerSelect },
            driver: { select: { id: true, fullName: true, avatarUrl: true } },
          },
        },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    const byId = new Map(threads.map((thread) => [thread.id, thread]));
    return visibleIds
      .map((id) => byId.get(id))
      .filter((thread): thread is NonNullable<typeof thread> => thread != null)
      .map((thread) => scopeGateCodeToBookingParty(thread, ctx.userId));
  }),

  getThread: protectedProcedure
    .input(z.object({ bookingId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireAnyUserAccess(ctx.userId);
      const thread = await prisma.chatThread.findUniqueOrThrow({
        where: { bookingId: input.bookingId },
        include: {
          booking: {
            include: {
              charger: { select: chatChargerSelect },
              driver: { select: { id: true, fullName: true, avatarUrl: true } },
            },
          },
          // Bound the history: fetch the most recent 200 messages, then return
          // them ascending for the UI. Prevents an unbounded payload on a
          // long-lived thread.
          messages: { orderBy: { createdAt: 'desc' }, take: 200 },
        },
      });
      if (thread.booking.driverId !== ctx.userId && thread.booking.charger.hostId !== ctx.userId) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      thread.messages.reverse();
      return scopeGateCodeToBookingParty(thread, ctx.userId);
    }),

  sendMessage: protectedProcedure.input(SendMessageInputZ).mutation(async ({ ctx, input }) => {
    await requireAnyUserAccess(ctx.userId);
    const { thread, counterpartyId } = await assertThreadParty(input.threadId, ctx.userId);
    if (thread.closedAt) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Thread is read-only.' });
    }
    await assertUsersCanMessage(ctx.userId, counterpartyId);
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
    await requireAnyUserAccess(ctx.userId);
    await assertThreadParty(input.threadId, ctx.userId);
    // AUDIT M3: honor upToMessageId. UUIDs aren't monotonic, so we look up the
    // message's createdAt and mark read only counterparty messages <= that
    // timestamp, so messages that arrive after the marker remain unread.
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
