import type { z } from 'zod';
import type { posts } from './schema.ts';
import type { querySchema } from './schemas.ts';

export type PostRow = typeof posts.$inferSelect;
export type NewPostRow = typeof posts.$inferInsert;
export type PostQuery = z.infer<typeof querySchema>;
export type PostProjection = Omit<PostRow, 'deletedAt'> & Pick<Post, 'author' | 'favorite'>;

export interface PostInput {
  type: 'lost' | 'found';
  title: string;
  category: 'keys' | 'electronics' | 'umbrella' | 'wallet' | 'card' | 'other';
  location: string;
  occurredAt: string;
  description: string;
  contact: string;
  images: string[];
  lat: number | null;
  lng: number | null;
  coordinateSystem?: 'bd09' | 'legacy';
  status: 'active' | 'draft';
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
