import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { chatInputSchema } from '@mayoimon/shared';
import { userId, AppError } from '../infrastructure/context.ts';
import { getPost } from '../message/service.ts';
import {
  participant,
  listConversations,
  mapMessage,
  sendMessage,
  type ChatMessageRow,
} from './service.ts';

import { endpoint, json } from '../infrastructure/http.ts';
export const conversations = endpoint(
  async (req, ctx) => ({
    items: listConversations(ctx.db, userId(req)),
  }),
  { auth: true },
);
export const createConversation = endpoint(
  async (req, ctx) => {
    const p = z.object({ postId: z.uuid() }).parse(req.body);
    const post = getPost(ctx.db, p.postId, userId(req));
    if (post.userId === userId(req)) throw new AppError(400, '不能与自己发起会话');
    if (post.status !== 'active') throw new AppError(409, '该信息已完成，无法发起新联系');
    const [a, b] = [post.userId, userId(req)].sort();
    ctx.db.run(
      'INSERT OR IGNORE INTO conversations VALUES(?,?,?,?,?)',
      randomUUID(),
      p.postId,
      a,
      b,
      new Date().toISOString(),
    );
    const row = ctx.db.one<{ id: string }>(
      'SELECT id FROM conversations WHERE post_id=? AND user_a=? AND user_b=?',
      p.postId,
      a,
      b,
    )!;

    return { conversation: listConversations(ctx.db, userId(req)).find((c) => c.id === row.id) };
  },
  { auth: true, status: 201 },
);
export const chatHistory = endpoint(
  async (req, ctx) => {
    participant(ctx.db, req.params.id, userId(req));
    const p = z
      .object({
        before: z.coerce.number().int().positive().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(req.query);
    const rows = ctx.db.all<ChatMessageRow & { cursor: number }>(
      'SELECT rowid cursor,* FROM chat_messages WHERE conversation_id=? AND rowid<? ORDER BY rowid DESC LIMIT ?',
      req.params.id,
      p.before ?? Number.MAX_SAFE_INTEGER,
      p.limit,
    );
    return {
      items: rows.slice().reverse().map(mapMessage),
      nextCursor: rows.length === p.limit ? rows.at(-1)!.cursor : null,
    };
  },
  { auth: true },
);
export const sendChatMessage = endpoint(
  async (req, ctx) => {
    const p = chatInputSchema.parse(req.body);
    const result = sendMessage(ctx.db, req.params.id, userId(req), p.content, p.clientId);
    if (result.created) {
      ctx.emit(userId(req), { type: 'message', message: result.message });
      ctx.emit(result.peer, { type: 'message', message: result.message });
    }
    return json({ message: result.message }, result.created ? 201 : 200);
  },
  { auth: true, rate: 60 },
);
export const markRead = endpoint(
  async (req, ctx) => {
    participant(ctx.db, req.params.id, userId(req));
    const row = ctx.db.one<{ max: number }>(
      'SELECT COALESCE(MAX(rowid),0) max FROM chat_messages WHERE conversation_id=?',
      req.params.id,
    )!;
    ctx.db.run(
      'INSERT INTO conversation_reads VALUES(?,?,?) ON CONFLICT(conversation_id,user_id) DO UPDATE SET last_read_rowid=excluded.last_read_rowid',
      req.params.id,
      userId(req),
      row.max,
    );
    return { ok: true };
  },
  { auth: true },
);
export const markAllRead = endpoint(
  async (req, ctx) => {
    ctx.db.transaction(() => {
      for (const c of listConversations(ctx.db, userId(req))) {
        const row = ctx.db.one<{ max: number }>(
          'SELECT COALESCE(MAX(rowid),0) max FROM chat_messages WHERE conversation_id=?',
          c.id,
        )!;
        ctx.db.run(
          'INSERT INTO conversation_reads VALUES(?,?,?) ON CONFLICT(conversation_id,user_id) DO UPDATE SET last_read_rowid=excluded.last_read_rowid',
          c.id,
          userId(req),
          row.max,
        );
      }
    });
    return { ok: true };
  },
  { auth: true },
);
