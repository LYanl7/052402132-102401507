import type { conversations, chatMessages } from '../infrastructure/schema.ts';

export type ConversationRow = typeof conversations.$inferSelect;
export type ChatMessageRow = typeof chatMessages.$inferSelect;
export type ChatMessageCursorRow = ChatMessageRow & { cursor: number };
