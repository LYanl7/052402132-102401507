import type { Post } from '@mayoimon/shared';
import type { z } from 'zod';
import type { posts } from '../infrastructure/schema.ts';
import type { querySchema } from './schemas.ts';

export type PostRow = typeof posts.$inferSelect;
export type NewPostRow = typeof posts.$inferInsert;
export type PostQuery = z.infer<typeof querySchema>;
export type PostProjection = Omit<PostRow, 'deletedAt'> & Pick<Post, 'author' | 'favorite'>;
