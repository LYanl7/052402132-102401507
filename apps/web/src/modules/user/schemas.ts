import { z } from 'zod';

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
