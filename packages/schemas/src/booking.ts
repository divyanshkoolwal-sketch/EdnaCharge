import { z } from 'zod';

// AUDIT M8: cap booking duration and how far in the future start can be.
// Prevents pre-authorising kWh for a 10-year session and keeps pricing
// estimation numerics bounded well below Stripe's PI cap.
const MAX_BOOKING_MS = 24 * 60 * 60 * 1000; // 24 h
const MAX_START_LEAD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export const RequestBookingInputZ = z
  .object({
    chargerId: z.string().uuid(),
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    message: z.string().max(500).optional(),
  })
  .refine((b) => new Date(b.endAt) > new Date(b.startAt), { message: 'endAt must be after startAt' })
  .refine(
    (b) => new Date(b.endAt).getTime() - new Date(b.startAt).getTime() <= MAX_BOOKING_MS,
    { message: 'Booking duration cannot exceed 24 hours.' },
  )
  .refine(
    (b) => new Date(b.startAt).getTime() - Date.now() <= MAX_START_LEAD_MS,
    { message: 'Booking start must be within 7 days.' },
  );
export type RequestBookingInput = z.infer<typeof RequestBookingInputZ>;

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
