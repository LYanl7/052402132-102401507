import { z } from 'zod';

export const conversationInputSchema = z.object({ postId: z.uuid() });

export const chatHistoryQuerySchema = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
