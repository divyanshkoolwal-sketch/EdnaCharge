/** @file apps/api/src/routers/support.ts. */
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { prisma } from '@edna/db';
import { CreateSupportTicketInputZ } from '@edna/schemas';

async function assertTicketContext(input: {
  userId: string;
  bookingId?: string;
  sessionId?: string;
  payoutId?: string;
  contentReportId?: string;
}) {
  const { userId } = input;
  if (input.bookingId) {
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: input.bookingId },
      select: { driverId: true, charger: { select: { hostId: true } } },
    });
    if (booking.driverId !== userId && booking.charger.hostId !== userId) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
  }
  if (input.sessionId) {
    const session = await prisma.chargingSession.findUniqueOrThrow({
      where: { id: input.sessionId },
      select: { booking: { select: { driverId: true, charger: { select: { hostId: true } } } } },
    });
    if (session.booking.driverId !== userId && session.booking.charger.hostId !== userId) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
  }
  if (input.payoutId) {
    const payout = await prisma.payout.findUniqueOrThrow({
      where: { id: input.payoutId },
      select: { hostId: true },
    });
    if (payout.hostId !== userId) throw new TRPCError({ code: 'FORBIDDEN' });
  }
  if (input.contentReportId) {
    const report = await prisma.contentReport.findUniqueOrThrow({
      where: { id: input.contentReportId },
      select: { reporterId: true },
    });
    if (report.reporterId !== userId) throw new TRPCError({ code: 'FORBIDDEN' });
  }
}

export const supportRouter = router({
  createTicket: protectedProcedure
    .input(CreateSupportTicketInputZ)
    .mutation(async ({ ctx, input }) => {
      await assertTicketContext({ userId: ctx.userId, ...input });
      const booking = input.bookingId
        ? await prisma.booking.findUnique({
            where: { id: input.bookingId },
            select: { stripePaymentIntentId: true },
          })
        : null;
      return prisma.supportTicket.create({
        data: {
          userId: ctx.userId,
          bookingId: input.bookingId,
          sessionId: input.sessionId,
          payoutId: input.payoutId,
          contentReportId: input.contentReportId,
          stripePaymentIntentId: booking?.stripePaymentIntentId ?? null,
          subject: input.subject.trim(),
          message: input.message.trim(),
        },
      });
    }),
});
