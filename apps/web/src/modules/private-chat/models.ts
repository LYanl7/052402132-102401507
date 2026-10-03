import type { conversations, chatMessages } from './schema.ts';

export type ConversationRow = typeof conversations.$inferSelect;
export type ChatMessageRow = typeof chatMessages.$inferSelect;
export type ChatMessageCursorRow = ChatMessageRow & { cursor: number };

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  deviceId: string;
  seqId: number;
  createdAt: string;
  expiresAt: number;
}
export interface ChatSendInput {
  deviceId: string;
  seqId: number;
  content: string;
  queuedAt: string;
}
export interface Conversation {
  id: string;
  postId: string;
  postTitle: string;
  peer: { id: string; name: string };
  lastMessage: string;
  updatedAt: string;
  unread: number;
}
export type SocketEvent =
  | { type: 'message'; message: ChatMessage }
  | { type: 'ready'; ttlMs: number }
  | { type: 'session-expired' };

export interface ChatHistory {
  items: ChatMessage[];
  nextCursor: number | null;
}

export interface LocalMessage extends ChatMessage {
  state: 'pending' | 'sent' | 'failed';
  queuedAt: string;
  read: boolean;
  unreadConversation: string;
  failure?: string;
}
