import type { PostInput } from './models.ts';
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

export const postInputSchema = z
  .object({
    type: z.enum(['lost', 'found']),
    title: z.string().trim().max(60),
    category: z.enum(['keys', 'electronics', 'umbrella', 'wallet', 'card', 'other']),
    location: z.string().trim().max(120),
    occurredAt: z.union([z.iso.datetime(), z.literal('')]),
    description: z.string().trim().max(2000),
    contact: z.string().trim().max(120).default('站内联系'),
    images: z
      .array(z.string().regex(/^\/uploads\/[a-f0-9-]+\.(png|jpg|webp)$/))
      .max(9)
      .default([]),
    lat: z.number().min(-90).max(90).nullable().default(null),
    lng: z.number().min(-180).max(180).nullable().default(null),
    coordinateSystem: z.enum(['bd09', 'legacy']).default('bd09'),
    status: z.enum(['active', 'draft']).default('active'),
  })
  .superRefine((p, ctx) => {
    if (p.status === 'active')
      for (const key of ['title', 'location', 'occurredAt', 'description'] as const) {
        if (!p[key])
          ctx.addIssue({ code: 'custom', path: [key], message: '请填写名称、地点、时间和描述' });
      }
    if ((p.lat === null) !== (p.lng === null))
      ctx.addIssue({ code: 'custom', message: '经纬度需同时填写' });
    if (p.occurredAt && Date.parse(p.occurredAt) > Date.now() + 60000)
      ctx.addIssue({ code: 'custom', path: ['occurredAt'], message: '时间不能晚于现在' });
  }) satisfies z.ZodType<PostInput>;
