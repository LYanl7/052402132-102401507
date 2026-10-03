import {
  and,
  asc,
  desc,
  eq,
  gt,
  lt,
  lte,
  ne,
  or,
  sql,
  notExists,
  inArray,
  getTableColumns,
} from 'drizzle-orm';
import type { ChatMessage, Conversation } from '@mayoimon/shared';
import type { Database } from '../infrastructure/database.ts';
import {
  conversations,
  chatMessages,
  chatReceipts,
  chatReads,
  chatSequences,
  posts,
  users,
} from '../infrastructure/schema.ts';
import type { ConversationRow } from './models.ts';
import { AppError } from '../infrastructure/context.ts';

const messageCursor = sql<number>`${chatMessages}.rowid`;
const { clientId: _legacy, ...messageColumns } = getTableColumns(chatMessages);
function membership(user: string) {
  return or(eq(conversations.userA, user), eq(conversations.userB, user));
}
export function findConversation(db: Database, id: string) {
  return db.orm.select().from(conversations).where(eq(conversations.id, id)).get();
}
export function findConversations(db: Database, user: string): Conversation[] {
  const live = gt(chatMessages.expiresAt, Date.now());
  const last = db.orm
    .select({ content: chatMessages.content })
    .from(chatMessages)
    .where(and(eq(chatMessages.conversationId, conversations.id), live))
    .orderBy(desc(messageCursor))
    .limit(1);
  const read = db.orm
    .select({ id: chatReads.messageId })
    .from(chatReads)
    .where(and(eq(chatReads.messageId, chatMessages.id), eq(chatReads.userId, user)));
  const unread = db.orm
    .select({ n: sql<number>`count(*)` })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.conversationId, conversations.id),
        ne(chatMessages.senderId, user),
        live,
        notExists(read),
      ),
    );
  return db.orm
    .select({
      id: conversations.id,
      postId: conversations.postId,
      postTitle: posts.title,
      peer: { id: users.id, name: users.name },
      lastMessage: sql<string>`coalesce((${last}), '')`,
      updatedAt: conversations.updatedAt,
      unread: sql<number>`(${unread})`.mapWith(Number),
    })
    .from(conversations)
    .innerJoin(posts, eq(posts.id, conversations.postId))
    .innerJoin(
      users,
      eq(
        users.id,
        sql`case when ${conversations.userA} = ${user} then ${conversations.userB} else ${conversations.userA} end`,
      ),
    )
    .where(membership(user))
    .orderBy(desc(conversations.updatedAt))
    .all();
}
export function getOrCreateConversation(db: Database, conversation: ConversationRow) {
  db.orm.insert(conversations).values(conversation).onConflictDoNothing().run();
  return db.orm
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.postId, conversation.postId),
        eq(conversations.userA, conversation.userA),
        eq(conversations.userB, conversation.userB),
      ),
    )
    .get()!;
}
// Identity and the sequence high-water mark are committed with the message.
// Only this small counter survives TTL; no expired content/receipts are kept.
export function acceptMessage(db: Database, message: ChatMessage) {
  return db.orm.transaction(
    (tx) => {
      const scope = and(
        eq(chatMessages.conversationId, message.conversationId),
        eq(chatMessages.senderId, message.senderId),
        eq(chatMessages.deviceId, message.deviceId),
      );
      const old = tx
        .select(messageColumns)
        .from(chatMessages)
        .where(and(scope, eq(chatMessages.seqId, message.seqId)))
        .get();
      if (old) {
        if (old.expiresAt <= Date.now()) throw new AppError(410, '消息已过期，请勿重用序号');
        if (old.content !== message.content) throw new AppError(409, '消息序号已被使用');
        return { message: old, created: false };
      }
      const key = {
        conversationId: message.conversationId,
        senderId: message.senderId,
        deviceId: message.deviceId,
      };
      const previous = tx
        .select()
        .from(chatSequences)
        .where(
          and(
            eq(chatSequences.conversationId, key.conversationId),
            eq(chatSequences.senderId, key.senderId),
            eq(chatSequences.deviceId, key.deviceId),
          ),
        )
        .get();
      if (previous && message.seqId <= previous.lastSeq)
        throw new AppError(410, '消息序号已过期或已被使用');
      tx.insert(chatSequences)
        .values({ ...key, lastSeq: message.seqId })
        .onConflictDoUpdate({
          target: [chatSequences.conversationId, chatSequences.senderId, chatSequences.deviceId],
          set: { lastSeq: message.seqId },
        })
        .run();
      tx.insert(chatMessages)
        .values({
          ...message,
          clientId: `${message.conversationId}:${message.deviceId}:${message.seqId}`,
        })
        .run();
      tx.update(conversations)
        .set({ updatedAt: message.createdAt })
        .where(eq(conversations.id, message.conversationId))
        .run();
      return { message, created: true };
    },
    { behavior: 'immediate' },
  );
}
export function findChatHistory(db: Database, id: string, before: number, limit: number) {
  return db.orm
    .select({ ...messageColumns, cursor: messageCursor })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.conversationId, id),
        lt(messageCursor, before),
        gt(chatMessages.expiresAt, Date.now()),
      ),
    )
    .orderBy(desc(messageCursor))
    .limit(limit)
    .all();
}
export function pendingMessages(
  db: Database,
  user: string,
  device: string,
  limit = 50,
): ChatMessage[] {
  const received = db.orm
    .select({ id: chatReceipts.messageId })
    .from(chatReceipts)
    .where(
      and(
        eq(chatReceipts.messageId, chatMessages.id),
        eq(chatReceipts.userId, user),
        eq(chatReceipts.deviceId, device),
      ),
    );
  return db.orm
    .select(messageColumns)
    .from(chatMessages)
    .innerJoin(conversations, eq(conversations.id, chatMessages.conversationId))
    .where(and(membership(user), gt(chatMessages.expiresAt, Date.now()), notExists(received)))
    .orderBy(asc(messageCursor))
    .limit(limit)
    .all();
}
export function messagesByIds(
  db: Database,
  user: string,
  ids: string[],
  conversationId?: string,
): ChatMessage[] {
  if (!ids.length) return [];
  return db.orm
    .select(messageColumns)
    .from(chatMessages)
    .innerJoin(conversations, eq(conversations.id, chatMessages.conversationId))
    .where(
      and(
        membership(user),
        inArray(chatMessages.id, ids),
        gt(chatMessages.expiresAt, Date.now()),
        conversationId ? eq(chatMessages.conversationId, conversationId) : undefined,
      ),
    )
    .orderBy(asc(messageCursor))
    .all();
}
export function acknowledge(db: Database, user: string, device: string, ids: string[]) {
  const items = messagesByIds(db, user, ids);
  if (items.length)
    db.orm
      .insert(chatReceipts)
      .values(items.map((m) => ({ messageId: m.id, userId: user, deviceId: device })))
      .onConflictDoNothing()
      .run();
}
export function markMessagesRead(
  db: Database,
  user: string,
  ids: string[],
  conversationId?: string,
) {
  const items = messagesByIds(db, user, ids, conversationId);
  if (items.length)
    db.orm
      .insert(chatReads)
      .values(items.map((m) => ({ messageId: m.id, userId: user })))
      .onConflictDoNothing()
      .run();
}
export function saveReadCursors(db: Database, ids: string[], user: string) {
  // Explicit read-all action only; ordinary reads name the messages displayed.
  db.orm.transaction((tx) => {
    const items = tx
      .select({ id: chatMessages.id })
      .from(chatMessages)
      .innerJoin(conversations, eq(conversations.id, chatMessages.conversationId))
      .where(
        and(
          membership(user),
          inArray(conversations.id, ids),
          gt(chatMessages.expiresAt, Date.now()),
        ),
      )
      .all();
    for (const m of items)
      tx.insert(chatReads).values({ messageId: m.id, userId: user }).onConflictDoNothing().run();
  });
}
export function purgeExpiredMessages(db: Database, now = Date.now()) {
  return db.orm.delete(chatMessages).where(lte(chatMessages.expiresAt, now)).run().changes;
}
