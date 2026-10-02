import { z } from 'zod';

export const categories = {
  keys: '钥匙',
  electronics: '数码',
  umbrella: '雨伞',
  wallet: '卡包',
  card: '证件卡片',
  other: '其他',
} as const;
export const campusPlaces = [
  { name: '图书馆 · 2楼', lat: 26.0588, lng: 119.1968 },
  { name: '教学楼A座 · 1楼', lat: 26.0578, lng: 119.198 },
  { name: '体育馆 · 门口', lat: 26.0567, lng: 119.1958 },
  { name: '食堂西门', lat: 26.0569, lng: 119.197 },
  { name: '操场 · 看台', lat: 26.0558, lng: 119.196 },
  { name: '宿舍楼 · 门口', lat: 26.058, lng: 119.1952 },
  { name: '图书馆 · 服务台', lat: 26.0588, lng: 119.1968 },
] as const;
export const campusCenter = { lat: 26.0575, lng: 119.1968 };
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
  });
export const chatInputSchema = z.object({
  content: z.string().trim().min(1, '请输入消息').max(2000),
  clientId: z.uuid(),
});
export type PostInput = z.infer<typeof postInputSchema>;
export interface User {
  id: string;
  email: string;
  name: string;
  bio: string;
}
export interface Post extends Omit<PostInput, 'status'> {
  id: string;
  userId: string;
  status: 'active' | 'draft' | 'completed';
  views: number;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string };
  favorite: boolean;
  distance?: number;
}
export interface PostList {
  items: Post[];
  total: number;
  page: number;
  pageSize: number;
}
export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  clientId: string;
  createdAt: string;
}
export interface Conversation {
  id: string;
  postId: string;
  postTitle: string;
  peer: { id: string; name: string };
  lastMessage: string;
  updatedAt: string;
  unread: number;
}
export interface ProfileStats {
  history: number;
  favorites: number;
  active: number;
  completed: number;
  drafts: number;
}
export type SocketEvent =
  { type: 'message'; message: ChatMessage } | { type: 'ready' } | { type: 'session-expired' };
