import { z } from 'zod';

export const SetDefaultPaymentMethodInputZ = z.object({
  paymentMethodId: z.string().min(1),
});
