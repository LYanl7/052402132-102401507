import { and, count, desc, eq, getTableColumns, gt, lt, ne, or, sql } from 'drizzle-orm';
import type { ChatMessage, Conversation } from '@mayoimon/shared';
import type { Database } from '../infrastructure/database.ts';
import {
  conversations,
  chatMessages,
  conversationReads,
  posts,
  users,
} from '../infrastructure/schema.ts';
import type { ConversationRow } from './models.ts';

const messageCursor = sql<number>`${chatMessages}.rowid`;
export function findConversation(db: Database, id: string) {
  return db.orm.select().from(conversations).where(eq(conversations.id, id)).get();
}
export function findConversations(db: Database, user: string): Conversation[] {
  const lastMessage = db.orm
    .select({ content: chatMessages.content })
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversations.id))
    .orderBy(desc(messageCursor))
    .limit(1);
  const readCursor = db.orm
    .select({ cursor: conversationReads.lastReadRowid })
    .from(conversationReads)
    .where(
      and(
        eq(conversationReads.conversationId, conversations.id),
        eq(conversationReads.userId, user),
      ),
    );
  const unread = db.orm
    .select({ count: count() })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.conversationId, conversations.id),
        ne(chatMessages.senderId, user),
        gt(messageCursor, sql`coalesce((${readCursor}), 0)`),
      ),
    );
  return db.orm
    .select({
      id: conversations.id,
      postId: conversations.postId,
      postTitle: posts.title,
      peer: { id: users.id, name: users.name },
      lastMessage: sql<string>`coalesce((${lastMessage}), '')`,
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
    .where(or(eq(conversations.userA, user), eq(conversations.userB, user)))
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
export function findMessageByClientId(db: Database, user: string, clientId: string) {
  return db.orm
    .select()
    .from(chatMessages)
    .where(and(eq(chatMessages.senderId, user), eq(chatMessages.clientId, clientId)))
    .get();
}
export function insertMessage(db: Database, message: ChatMessage) {
  db.orm.transaction(
    (tx) => {
      tx.insert(chatMessages).values(message).run();
      tx.update(conversations)
        .set({ updatedAt: message.createdAt })
        .where(eq(conversations.id, message.conversationId))
        .run();
    },
    { behavior: 'immediate' },
  );
}
export function findChatHistory(db: Database, id: string, before: number, limit: number) {
  return db.orm
    .select({ ...getTableColumns(chatMessages), cursor: messageCursor })
    .from(chatMessages)
    .where(and(eq(chatMessages.conversationId, id), lt(messageCursor, before)))
    .orderBy(desc(messageCursor))
    .limit(limit)
    .all();
}
export function saveReadCursors(db: Database, ids: string[], user: string) {
  db.orm.transaction(
    (tx) => {
      for (const id of ids) {
        const { cursor } = tx
          .select({ cursor: sql<number>`coalesce(max(${messageCursor}), 0)`.mapWith(Number) })
          .from(chatMessages)
          .where(eq(chatMessages.conversationId, id))
          .get()!;
        tx.insert(conversationReads)
          .values({ conversationId: id, userId: user, lastReadRowid: cursor })
          .onConflictDoUpdate({
            target: [conversationReads.conversationId, conversationReads.userId],
            set: { lastReadRowid: cursor },
          })
          .run();
      }
    },
    { behavior: 'immediate' },
  );
}
