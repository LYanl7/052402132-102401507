import { randomUUID } from 'node:crypto';
import type { ChatMessage, Conversation } from '@mayoimon/shared';
import type { Database } from '../infrastructure/database.ts';
import {
  findConversation,
  findConversations,
  findMessageByClientId,
  insertMessage,
} from './repository.ts';
import { AppError } from '../infrastructure/context.ts';

export function participant(db: Database, id: string, user: string) {
  const row = findConversation(db, id);
  if (!row || (row.userA !== user && row.userB !== user)) throw new AppError(404, '会话不存在');
  return row;
}
export function listConversations(db: Database, user: string): Conversation[] {
  return findConversations(db, user);
}
export function sendMessage(
  db: Database,
  conversationId: string,
  user: string,
  content: string,
  clientId: string,
) {
  const c = participant(db, conversationId, user);
  const old = findMessageByClientId(db, user, clientId);
  if (old) {
    if (old.conversationId !== conversationId || old.content !== content)
      throw new AppError(409, '消息标识已被使用');
    return {
      message: old,
      peer: c.userA === user ? c.userB : c.userA,
      created: false,
    };
  }
  const message: ChatMessage = {
    id: randomUUID(),
    conversationId,
    senderId: user,
    content,
    clientId,
    createdAt: new Date().toISOString(),
  };
  insertMessage(db, message);
  return { message, peer: c.userA === user ? c.userB : c.userA, created: true };
}
