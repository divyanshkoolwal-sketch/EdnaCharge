/** @file packages/schemas/src/moderation.ts. */
import { z } from 'zod';

export const ModerationReasonZ = z.enum([
  'harassment',
  'hate_speech',
  'sexual_content',
  'spam',
  'privacy',
  'fraud',
  'other',
]);
export type ModerationReason = z.infer<typeof ModerationReasonZ>;

export const ReportChatMessageInputZ = z.object({
  messageId: z.string().uuid(),
  reason: ModerationReasonZ,
  details: z.string().max(500).optional(),
});
export type ReportChatMessageInput = z.infer<typeof ReportChatMessageInputZ>;

export const ReportReviewInputZ = z.object({
  reviewId: z.string().uuid(),
  reason: ModerationReasonZ,
  details: z.string().max(500).optional(),
});
export type ReportReviewInput = z.infer<typeof ReportReviewInputZ>;

export const ReportUserInputZ = z.object({
  userId: z.string().uuid(),
  reason: ModerationReasonZ,
  details: z.string().max(500).optional(),
});
export type ReportUserInput = z.infer<typeof ReportUserInputZ>;

export const BlockUserInputZ = z.object({
  userId: z.string().uuid(),
});
export type BlockUserInput = z.infer<typeof BlockUserInputZ>;

export const ResolveReviewReportInputZ = z.object({
  reportId: z.string().uuid(),
  hideReview: z.boolean(),
  reason: z.string().max(300).optional(),
});
export type ResolveReviewReportInput = z.infer<typeof ResolveReviewReportInputZ>;
