/** @file packages/schemas/src/support.ts. */
import { z } from 'zod';

export const CreateSupportTicketInputZ = z.object({
  subject: z.string().min(3).max(120),
  message: z.string().min(10).max(2000),
  bookingId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
  payoutId: z.string().uuid().optional(),
  contentReportId: z.string().uuid().optional(),
});
export type CreateSupportTicketInput = z.infer<typeof CreateSupportTicketInputZ>;
