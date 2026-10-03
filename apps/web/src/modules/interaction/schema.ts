import { primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from '../user/schema.ts';
import { posts } from '../message/schema.ts';

export const favorites = sqliteTable(
  'favorites',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    postId: text('post_id')
      .notNull()
      .references(() => posts.id),
    createdAt: text('created_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.postId] })],
);
export const history = sqliteTable(
  'history',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    postId: text('post_id')
      .notNull()
      .references(() => posts.id),
    viewedAt: text('viewed_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.postId] })],
);
