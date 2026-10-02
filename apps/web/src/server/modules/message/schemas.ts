import { z } from 'zod';

export const querySchema = z.object({
  q: z.string().max(120).default(''),
  type: z.enum(['lost', 'found']).optional(),
  status: z.enum(['active', 'completed']).optional(),
  category: z.enum(['keys', 'electronics', 'umbrella', 'wallet', 'card', 'other']).optional(),
  days: z.coerce.number().int().min(1).max(365).optional(),
  sort: z.enum(['newest', 'oldest']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const nearbyQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().min(50).max(50000).default(1500),
  type: z.enum(['lost', 'found']).optional(),
});

export const myPostsQuerySchema = z.object({
  status: z.enum(['active', 'completed', 'draft']).default('active'),
});
