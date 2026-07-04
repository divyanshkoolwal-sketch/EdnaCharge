/** @file apps/api/src/routers/moderation.ts. */
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { prisma } from '@edna/db';
import {
  BlockUserInputZ,
  ReportChatMessageInputZ,
  ReportReviewInputZ,
  ReportUserInputZ,
  ResolveReviewReportInputZ,
} from '@edna/schemas';

/**
 * The ContentReport.status a review report resolves to. The return MUST be a
 * member of the ContentReport_status_check CHECK set
 * ('open'|'reviewed'|'dismissed'|'actioned'); the old 'resolved_hidden' /
 * 'resolved_no_action' violated the CHECK (23514 → 500) AFTER the review was
 * already hidden. Extracted as a pure fn so a unit test pins the exact literals.
 */
export function reviewReportResolutionStatus(hideReview: boolean): 'actioned' | 'dismissed' {
  return hideReview ? 'actioned' : 'dismissed';
}

async function assertSharedBooking(userId: string, otherUserId: string): Promise<void> {
  const shared = await prisma.booking.findFirst({
    where: {
      OR: [
        { driverId: userId, charger: { hostId: otherUserId } },
        { driverId: otherUserId, charger: { hostId: userId } },
      ],
    },
    select: { id: true },
  });
  if (!shared) throw new TRPCError({ code: 'FORBIDDEN' });
}

function assertModerationAdmin(email: string): void {
  const admins = (process.env.MODERATION_ADMIN_EMAILS ?? '')
    .split(',')
    .map((v: string) => v.trim().toLowerCase())
    .filter(Boolean);
  if (!admins.includes(email.toLowerCase())) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
}

export const moderationRouter = router({
  reportChatMessage: protectedProcedure
    .input(ReportChatMessageInputZ)
    .mutation(async ({ ctx, input }) => {
      const message = await prisma.chatMessage.findUniqueOrThrow({
        where: { id: input.messageId },
        include: {
          thread: {
            include: {
              booking: { include: { charger: { select: { hostId: true } } } },
            },
          },
        },
      });
      const hostId = message.thread.booking.charger.hostId;
      const isParty = message.thread.booking.driverId === ctx.userId || hostId === ctx.userId;
      if (!isParty) throw new TRPCError({ code: 'FORBIDDEN' });
      if (!message.senderId || message.senderId === ctx.userId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'You can only report another user.' });
      }

      return prisma.contentReport.create({
        data: {
          reporterId: ctx.userId,
          targetUserId: message.senderId,
          messageId: message.id,
          targetType: 'chat_message',
          reason: input.reason,
          details: input.details,
        },
      });
    }),

  reportReview: protectedProcedure.input(ReportReviewInputZ).mutation(async ({ ctx, input }) => {
    const review = await prisma.review.findUniqueOrThrow({ where: { id: input.reviewId } });
    await assertSharedBooking(ctx.userId, review.authorId);
    return prisma.contentReport.create({
      data: {
        reporterId: ctx.userId,
        targetUserId: review.authorId,
        reviewId: review.id,
        targetType: 'review',
        reason: input.reason,
        details: input.details,
      },
    });
  }),

  reportUser: protectedProcedure.input(ReportUserInputZ).mutation(async ({ ctx, input }) => {
    if (input.userId === ctx.userId) throw new TRPCError({ code: 'BAD_REQUEST' });
    await assertSharedBooking(ctx.userId, input.userId);
    return prisma.contentReport.create({
      data: {
        reporterId: ctx.userId,
        targetUserId: input.userId,
        targetType: 'user',
        reason: input.reason,
        details: input.details,
      },
    });
  }),

  blockUser: protectedProcedure.input(BlockUserInputZ).mutation(async ({ ctx, input }) => {
    if (input.userId === ctx.userId) throw new TRPCError({ code: 'BAD_REQUEST' });
    await assertSharedBooking(ctx.userId, input.userId);
    await prisma.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId: ctx.userId, blockedId: input.userId } },
      create: { blockerId: ctx.userId, blockedId: input.userId },
      update: {},
    });
    return { ok: true as const };
  }),

  resolveReviewReport: protectedProcedure
    .input(ResolveReviewReportInputZ)
    .mutation(async ({ ctx, input }) => {
      assertModerationAdmin(ctx.email);
      const report = await prisma.contentReport.findUniqueOrThrow({
        where: { id: input.reportId },
        select: { reviewId: true, targetType: true },
      });
      if (report.targetType !== 'review' || !report.reviewId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Report is not tied to a review.' });
      }
      // Atomic: the review-hide and report-status writes must commit together.
      // Status values MUST come from ContentReport_status_check
      // ('open'|'reviewed'|'dismissed'|'actioned') — the previous
      // 'resolved_hidden'/'resolved_no_action' violated the CHECK (23514 → 500)
      // after the review was already hidden, stranding a hidden review with a
      // still-open report.
      const status = reviewReportResolutionStatus(input.hideReview);
      const result = await prisma.$transaction(async (tx) => {
        if (input.hideReview) {
          await tx.review.update({
            where: { id: report.reviewId! },
            data: { hiddenAt: new Date(), hiddenReason: input.reason ?? 'moderated' },
          });
        }
        return tx.contentReport.update({
          where: { id: input.reportId },
          data: { status },
        });
      });
      return result;
    }),
});
