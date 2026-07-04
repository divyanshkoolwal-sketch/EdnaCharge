/** @file packages/schemas/src/access.ts. */
import { z } from 'zod';
import { AppRoleZ } from './enums.js';

export const RedeemInviteCodeInputZ = z.object({
  role: AppRoleZ,
  code: z.string().min(3).max(80),
});
export type RedeemInviteCodeInput = z.infer<typeof RedeemInviteCodeInputZ>;

export const JoinAppWaitlistInputZ = z.object({
  role: AppRoleZ,
  city: z.string().trim().min(1).max(80),
  postalCode: z.string().trim().min(3).max(16),
  phone: z.string().trim().max(32).optional(),
  chargerBrand: z.string().trim().max(80).optional(),
  hasOcpp: z.boolean().optional(),
  notes: z.string().trim().max(500).optional(),
});
export type JoinAppWaitlistInput = z.infer<typeof JoinAppWaitlistInputZ>;
