import { customType, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
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
