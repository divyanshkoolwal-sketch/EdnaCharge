/** @file packages/schemas/src/payment.ts. */
import { z } from 'zod';

export const SetDefaultPaymentMethodInputZ = z.object({
  paymentMethodId: z.string().min(1),
});

export const DetachPaymentMethodInputZ = z.object({
  paymentMethodId: z.string().min(1),
});
