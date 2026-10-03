import { randomUUID } from 'node:crypto';
import type { ChatSendInput } from '@mayoimon/shared';
import type { Database } from '../infrastructure/database.ts';
import { findConversation, findConversations, acceptMessage } from './repository.ts';
import { AppError } from '../infrastructure/context.ts';
export function participant(db: Database, id: string, user: string) {
  const row = findConversation(db, id);
  if (!row || (row.userA !== user && row.userB !== user)) throw new AppError(404, '会话不存在');
  return row;
}
export const listConversations = findConversations;
export function sendMessage(
  db: Database,
  conversationId: string,
  user: string,
  input: ChatSendInput,
  ttlMs = 7 * 86400000,
) {
  const c = participant(db, conversationId, user);
  const now = Date.now();
  const queued = Date.parse(input.queuedAt);
  if (!Number.isFinite(queued) || queued > now + 60000)
    throw new AppError(400, '发送时间无效，请检查设备时间');
  if (queued <= now - ttlMs) throw new AppError(410, '待发送消息已过期，请重新发送');
  const result = acceptMessage(db, {
    id: randomUUID(),
    conversationId,
    senderId: user,
    content: input.content,
    deviceId: input.deviceId,
    seqId: input.seqId,
    createdAt: new Date(now).toISOString(),
    expiresAt: now + ttlMs,
  });
  return { ...result, peer: c.userA === user ? c.userB : c.userA };
}
