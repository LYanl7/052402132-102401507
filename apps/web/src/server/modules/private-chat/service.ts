import { randomUUID } from 'node:crypto';
import type { ChatMessage, Conversation } from '@mayoimon/shared';
import type { Database } from '../infrastructure/database.ts';
import { AppError } from '../infrastructure/context.ts';

interface ConversationRow {
  id: string;
  post_id: string;
  user_a: string;
  user_b: string;
  updated_at: string;
}
export interface ChatMessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  client_id: string;
  created_at: string;
}
export function participant(db: Database, id: string, user: string) {
  const row = db.one<ConversationRow>('SELECT * FROM conversations WHERE id=?', id);
  if (!row || (row.user_a !== user && row.user_b !== user)) throw new AppError(404, '会话不存在');
  return row;
}
export function mapMessage(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    content: row.content,
    clientId: row.client_id,
    createdAt: row.created_at,
  };
}
export function listConversations(db: Database, user: string): Conversation[] {
  return db
    .all<
      ConversationRow & {
        peer_id: string;
        peer_name: string;
        post_title: string;
        last_message: string;
        unread: number;
      }
    >(
      `SELECT c.*,p.title post_title,u.id peer_id,u.name peer_name,COALESCE((SELECT content FROM chat_messages m WHERE m.conversation_id=c.id ORDER BY m.rowid DESC LIMIT 1),'') last_message,(SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id=c.id AND m.sender_id<>? AND m.rowid>COALESCE((SELECT last_read_rowid FROM conversation_reads r WHERE r.conversation_id=c.id AND r.user_id=?),0)) unread FROM conversations c JOIN posts p ON p.id=c.post_id JOIN users u ON u.id=CASE WHEN c.user_a=? THEN c.user_b ELSE c.user_a END WHERE c.user_a=? OR c.user_b=? ORDER BY c.updated_at DESC`,
      user,
      user,
      user,
      user,
      user,
    )
    .map((c) => ({
      id: c.id,
      postId: c.post_id,
      postTitle: c.post_title,
      peer: { id: c.peer_id, name: c.peer_name },
      lastMessage: c.last_message,
      unread: c.unread,
      updatedAt: c.updated_at,
    }));
}
export function sendMessage(
  db: Database,
  conversationId: string,
  user: string,
  content: string,
  clientId: string,
) {
  const c = participant(db, conversationId, user);
  const old = db.one<ChatMessageRow>(
    'SELECT * FROM chat_messages WHERE sender_id=? AND client_id=?',
    user,
    clientId,
  );
  if (old) {
    if (old.conversation_id !== conversationId || old.content !== content)
      throw new AppError(409, '消息标识已被使用');
    return {
      message: mapMessage(old),
      peer: c.user_a === user ? c.user_b : c.user_a,
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
  db.transaction(() => {
    db.run(
      'INSERT INTO chat_messages VALUES(?,?,?,?,?,?)',
      message.id,
      conversationId,
      user,
      content,
      clientId,
      message.createdAt,
    );
    db.run('UPDATE conversations SET updated_at=? WHERE id=?', message.createdAt, conversationId);
  });
  return { message, peer: c.user_a === user ? c.user_b : c.user_a, created: true };
}
