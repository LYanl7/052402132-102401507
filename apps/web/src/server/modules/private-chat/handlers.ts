import { randomUUID } from 'node:crypto';
import {
  conversationInputSchema,
  chatHistoryQuerySchema,
  deviceSchema,
  messageIdsSchema,
  ackSchema,
} from './schemas.ts';
import { chatInputSchema } from '@mayoimon/shared';
import { userId as authenticatedUser, AppError } from '../infrastructure/context.ts';
import { getPost } from '../message/service.ts';
import { participant, listConversations, sendMessage } from './service.ts';

import {
  getOrCreateConversation,
  findChatHistory,
  saveReadCursors,
  pendingMessages,
  acknowledge,
  messagesByIds,
  markMessagesRead,
} from './repository.ts';
import { endpoint, json } from '../infrastructure/http.ts';
import type { RequestContext } from '../infrastructure/models.ts';
function userId(req: RequestContext) {
  const id = authenticatedUser(req);
  const expected = req.request.headers.get('x-chat-user-id');
  if (expected && expected !== id) throw new AppError(401, '登录账号已变更，请刷新页面');
  return id;
}
export const conversations = endpoint(
  async (req, ctx) => ({
    items: listConversations(ctx.db, userId(req)),
  }),
  { auth: true },
);
export const createConversation = endpoint(
  async (req, ctx) => {
    const p = conversationInputSchema.parse(req.body);
    const post = getPost(ctx.db, p.postId, userId(req));
    if (post.userId === userId(req)) throw new AppError(400, '不能与自己发起会话');
    if (post.status !== 'active') throw new AppError(409, '该信息已完成，无法发起新联系');
    const [a, b] = [post.userId, userId(req)].sort();
    const row = getOrCreateConversation(ctx.db, {
      id: randomUUID(),
      postId: p.postId,
      userA: a,
      userB: b,
      updatedAt: new Date().toISOString(),
    });

    return { conversation: listConversations(ctx.db, userId(req)).find((c) => c.id === row.id) };
  },
  { auth: true, status: 201 },
);
export const chatHistory = endpoint(
  async (req, ctx) => {
    participant(ctx.db, req.params.id, userId(req));
    const p = chatHistoryQuerySchema.parse(req.query);
    const rows = findChatHistory(
      ctx.db,
      req.params.id,
      p.before ?? Number.MAX_SAFE_INTEGER,
      p.limit,
    );
    return {
      items: rows
        .slice()
        .reverse()
        .map(({ cursor: _cursor, ...message }) => message),
      nextCursor: rows.length === p.limit ? rows.at(-1)!.cursor : null,
    };
  },
  { auth: true },
);
export const sendChatMessage = endpoint(
  async (req, ctx) => {
    const p = chatInputSchema.parse(req.body);
    const result = sendMessage(ctx.db, req.params.id, userId(req), p, ctx.chatTtlMs);
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
    markMessagesRead(ctx.db, userId(req), messageIdsSchema.parse(req.body).ids, req.params.id);
    return { ok: true };
  },
  { auth: true },
);

export const pendingDelivery = endpoint(
  (req, ctx) => ({
    items: pendingMessages(ctx.db, userId(req), deviceSchema.parse(req.query).deviceId),
    ttlMs: ctx.chatTtlMs,
  }),
  { auth: true },
);
export const acknowledgeDelivery = endpoint(
  (req, ctx) => {
    const input = ackSchema.parse(req.body);
    acknowledge(ctx.db, userId(req), input.deviceId, input.ids);
    return { ok: true };
  },
  { auth: true },
);
export const recentManifest = endpoint(
  (req, ctx) => {
    participant(ctx.db, req.params.id, userId(req));
    return {
      ids: findChatHistory(ctx.db, req.params.id, Number.MAX_SAFE_INTEGER, 50).map((m) => m.id),
      ttlMs: ctx.chatTtlMs,
    };
  },
  { auth: true },
);
export const fetchMissing = endpoint(
  (req, ctx) => {
    participant(ctx.db, req.params.id, userId(req));
    const { ids } = messageIdsSchema.parse(req.body);
    const items = messagesByIds(ctx.db, userId(req), ids, req.params.id);
    return { items, unavailable: ids.filter((id) => !items.some((m) => m.id === id)) };
  },
  { auth: true },
);
export const markAllRead = endpoint(
  async (req, ctx) => {
    saveReadCursors(
      ctx.db,
      listConversations(ctx.db, userId(req)).map((c) => c.id),
      userId(req),
    );
    return { ok: true };
  },
  { auth: true },
);
