import { z } from 'zod';
import type { PostInput } from './models.js';

export const credentialsSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(8, '密码至少 8 位').max(128),
});
export const registerSchema = credentialsSchema.extend({
  name: z.string().trim().min(1, '请填写昵称').max(24),
});
export const profileSchema = z.object({
  name: z.string().trim().min(1).max(24),
  bio: z.string().trim().max(120),
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
export const chatInputSchema = z.object({
  content: z.string().trim().min(1, '请输入消息').max(2000),
  deviceId: z.uuid(),
  seqId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  queuedAt: z.iso.datetime(),
});
