import { sql } from 'drizzle-orm';
import { check, index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { PostInput } from './models.ts';
import { users } from '../user/schema.ts';

export const posts = sqliteTable(
  'posts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    type: text('type', { enum: ['lost', 'found'] }).notNull(),
    title: text('title').notNull(),
    category: text('category').$type<PostInput['category']>().notNull(),
    location: text('location').notNull(),
    occurredAt: text('occurred_at').notNull(),
    description: text('description').notNull(),
    contact: text('contact').notNull(),
    images: text('images', { mode: 'json' }).$type<string[]>().notNull().default([]),
    lat: real('lat'),
    lng: real('lng'),
    coordinateSystem: text('coordinate_system', { enum: ['legacy', 'bd09'] })
      .notNull()
      .default('legacy'),
    status: text('status', { enum: ['active', 'draft', 'completed'] }).notNull(),
    views: integer('views').notNull().default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (t) => [
    check('posts_type', sql`${t.type} IN ('lost','found')`),
    check('posts_status', sql`${t.status} IN ('active','draft','completed')`),
    index('posts_public').on(t.status, t.deletedAt, t.createdAt),
    index('posts_owner').on(t.userId, t.status),
    index('posts_nearby').on(t.status, t.deletedAt, t.coordinateSystem, t.lat, t.lng),
  ],
);
