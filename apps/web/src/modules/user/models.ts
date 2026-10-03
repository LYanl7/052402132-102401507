import type { ChatMessage } from '../private-chat/models.ts';
import type { users } from './schema.ts';

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;

export interface User {
  id: string;
  email: string;
  name: string;
  bio: string;
}

export interface SessionContext {
  user: User | null;
  loading: boolean;
  updateUser: (user: User | null) => void;
  toast: (message: string) => void;
  lastMessage: ChatMessage | null;
  connected: boolean;
  revision: number;
}
