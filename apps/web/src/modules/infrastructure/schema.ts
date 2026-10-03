import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from '../user/schema.ts';

export const uploads = sqliteTable('uploads', {
  path: text('path').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  createdAt: text('created_at').notNull(),
});
export const schemaMigrations = sqliteTable('schema_migrations', {
  version: integer('version').primaryKey(),
  appliedAt: text('applied_at').notNull(),
});
