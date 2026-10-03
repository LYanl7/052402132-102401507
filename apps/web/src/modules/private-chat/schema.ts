import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core';
import { users } from '../user/schema.ts';
import { posts } from '../message/schema.ts';

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
    deviceId: text('device_id').notNull(),
    seqId: integer('seq_id').notNull(),
    expiresAt: integer('expires_at').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    unique().on(t.senderId, t.clientId),
    unique('chat_identity').on(t.conversationId, t.senderId, t.deviceId, t.seqId),
    index('chat_expiry').on(t.expiresAt),
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
export const chatSequences = sqliteTable(
  'chat_sequences',
  {
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id),
    senderId: text('sender_id')
      .notNull()
      .references(() => users.id),
    deviceId: text('device_id').notNull(),
    lastSeq: integer('last_seq').notNull(),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.senderId, t.deviceId] })],
);
export const chatReceipts = sqliteTable(
  'chat_receipts',
  {
    messageId: text('message_id')
      .notNull()
      .references(() => chatMessages.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    deviceId: text('device_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.userId, t.deviceId] })],
);
export const chatReads = sqliteTable(
  'chat_reads',
  {
    messageId: text('message_id')
      .notNull()
      .references(() => chatMessages.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.userId] })],
);
