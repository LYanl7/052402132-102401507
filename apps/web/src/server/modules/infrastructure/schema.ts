import { sql } from 'drizzle-orm';
import {
  check,
  customType,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core';
import type { PostInput } from '@mayoimon/shared';

const caseInsensitiveText = customType<{ data: string }>({ dataType: () => 'text COLLATE NOCASE' });

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: caseInsensitiveText('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  bio: text('bio').notNull().default('愿每件失物都能回家'),
  createdAt: text('created_at').notNull(),
});
export const sessions = sqliteTable(
  'sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [index('session_expiry').on(t.expiresAt)],
);
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
  ],
);
export const uploads = sqliteTable('uploads', {
  path: text('path').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  createdAt: text('created_at').notNull(),
});
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
export const conversations = sqliteTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    postId: text('post_id')
      .notNull()
      .references(() => posts.id),
    userA: text('user_a')
      .notNull()
      .references(() => users.id),
    userB: text('user_b')
      .notNull()
      .references(() => users.id),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    check('conversation_participants', sql`${t.userA} <> ${t.userB}`),
    unique().on(t.postId, t.userA, t.userB),
  ],
);
export const chatMessages = sqliteTable(
  'chat_messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id),
    senderId: text('sender_id')
      .notNull()
      .references(() => users.id),
    content: text('content').notNull(),
    clientId: text('client_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    unique().on(t.senderId, t.clientId),
    index('chat_timeline').on(t.conversationId, t.createdAt),
  ],
);
export const conversationReads = sqliteTable(
  'conversation_reads',
  {
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    lastReadRowid: integer('last_read_rowid').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] })],
);
export const schemaMigrations = sqliteTable('schema_migrations', {
  version: integer('version').primaryKey(),
  appliedAt: text('applied_at').notNull(),
});
