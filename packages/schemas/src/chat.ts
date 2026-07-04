/** @file packages/schemas/src/chat.ts. */
import { z } from 'zod';

export const SendMessageInputZ = z.object({
  threadId: z.string().uuid(),
  body: z.string().min(1).max(2000),
});
export type SendMessageInput = z.infer<typeof SendMessageInputZ>;

export const MarkReadInputZ = z.object({
  threadId: z.string().uuid(),
  upToMessageId: z.string().uuid(),
});
export type MarkReadInput = z.infer<typeof MarkReadInputZ>;
