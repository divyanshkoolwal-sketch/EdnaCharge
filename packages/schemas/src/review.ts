/** @file packages/schemas/src/review.ts. */
import { z } from 'zod';

export const CreateReviewInputZ = z.object({
  bookingId: z.string().uuid(),
  stars: z.number().int().min(1).max(5),
  text: z.string().max(500).optional(),
});
export type CreateReviewInput = z.infer<typeof CreateReviewInputZ>;
