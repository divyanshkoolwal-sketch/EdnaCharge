import { z } from 'zod';

export const RequestBookingInputZ = z
  .object({
    chargerId: z.string().uuid(),
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    message: z.string().max(500).optional(),
  })
  .refine((b) => new Date(b.endAt) > new Date(b.startAt), { message: 'endAt must be after startAt' });
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
