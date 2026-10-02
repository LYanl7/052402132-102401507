import type { users } from '../infrastructure/schema.ts';

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
