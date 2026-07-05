/** @file packages/schemas/src/booking.ts. */
import { z } from 'zod';

// AUDIT M8: cap booking duration and how far in the future start can be.
// Prevents pre-authorising kWh for a 10-year session and keeps pricing
// estimation numerics bounded well below Stripe's PI cap.
const MAX_BOOKING_MS = 24 * 60 * 60 * 1000; // 24 h
const MAX_START_LEAD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const START_PAST_SKEW_MS = 60 * 1000; // tolerate small client/server clock skew

function bookingWindowInput<T extends z.ZodRawShape>(shape: T) {
  return z
    .object({
      ...shape,
      startAt: z.string().datetime(),
      endAt: z.string().datetime(),
    })
    .superRefine((b, ctx) => {
      const { startAt, endAt } = b;
      if (typeof startAt !== 'string' || typeof endAt !== 'string') return;
      const startMs = Date.parse(startAt);
      const endMs = Date.parse(endAt);
      if (endMs <= startMs) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'endAt must be after startAt' });
      }
      if (startMs < Date.now() - START_PAST_SKEW_MS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Booking start cannot be in the past.',
        });
      }
      if (endMs - startMs > MAX_BOOKING_MS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Booking duration cannot exceed 24 hours.',
        });
      }
      if (startMs - Date.now() > MAX_START_LEAD_MS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Booking start must be within 7 days.',
        });
      }
    });
}

export const RequestBookingInputZ = bookingWindowInput({
  chargerId: z.string().uuid(),
  message: z.string().max(500).optional(),
});
export type RequestBookingInput = z.infer<typeof RequestBookingInputZ>;

// Driver edits the start/end window of a not-yet-responded booking. Same
// duration / lead-time bounds as the original request.
export const ModifyBookingInputZ = bookingWindowInput({
  bookingId: z.string().uuid(),
});
export type ModifyBookingInput = z.infer<typeof ModifyBookingInputZ>;

export const RespondBookingInputZ = z.object({
  bookingId: z.string().uuid(),
  decision: z.enum(['accept', 'decline']),
  reason: z.string().max(300).optional(),
});
export type RespondBookingInput = z.infer<typeof RespondBookingInputZ>;

export const CancelBookingInputZ = z.object({
  bookingId: z.string().uuid(),
  reason: z.string().max(300),
});

export const StartSessionInputZ = z.object({ bookingId: z.string().uuid() });
export const StopSessionInputZ = z.object({ sessionId: z.string().uuid() });
