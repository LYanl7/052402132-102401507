import { z } from 'zod';

export const conversationInputSchema = z.object({ postId: z.uuid() });
export const deviceSchema = z.object({ deviceId: z.uuid() });
export const messageIdsSchema = z.object({ ids: z.array(z.uuid()).max(100) });
export const ackSchema = messageIdsSchema.extend({ deviceId: z.uuid() });

export const chatHistoryQuerySchema = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
