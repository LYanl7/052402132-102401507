import { and, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { ProfileStats } from '@mayoimon/shared';
import type { Database } from '../infrastructure/database.ts';
import { favorites, history, posts } from '../infrastructure/schema.ts';

export function recordPostView(
  db: Database,
  postId: string,
  userId: string | undefined,
  viewedAt: string,
) {
  db.orm.transaction(
    (tx) => {
      tx.update(posts)
        .set({ views: sql`${posts.views} + 1` })
        .where(eq(posts.id, postId))
        .run();
      if (userId)
        tx.insert(history)
          .values({ userId, postId, viewedAt })
          .onConflictDoUpdate({
            target: [history.userId, history.postId],
            set: { viewedAt },
          })
          .run();
    },
    { behavior: 'immediate' },
  );
}
export function insertFavorite(db: Database, userId: string, postId: string, createdAt: string) {
  db.orm.insert(favorites).values({ userId, postId, createdAt }).onConflictDoNothing().run();
}
export function deleteFavorite(db: Database, userId: string, postId: string) {
  db.orm
    .delete(favorites)
    .where(and(eq(favorites.userId, userId), eq(favorites.postId, postId)))
    .run();
}
export function deleteHistory(db: Database, userId: string) {
  db.orm.delete(history).where(eq(history.userId, userId)).run();
}
export function getProfileStats(db: Database, owner: string): ProfileStats {
  const stats: ProfileStats = { history: 0, favorites: 0, active: 0, completed: 0, drafts: 0 };
  for (const kind of ['history', 'favorites'] as const) {
    const table = kind === 'history' ? history : favorites;
    stats[kind] = db.orm
      .select({ count: count() })
      .from(table)
      .innerJoin(posts, eq(posts.id, table.postId))
      .where(
        and(
          eq(table.userId, owner),
          isNull(posts.deletedAt),
          inArray(posts.status, ['active', 'completed']),
        ),
      )
      .get()!.count;
  }
  const rows = db.orm
    .select({ status: posts.status, count: count() })
    .from(posts)
    .where(and(eq(posts.userId, owner), isNull(posts.deletedAt)))
    .groupBy(posts.status)
    .all();
  for (const row of rows) stats[row.status === 'draft' ? 'drafts' : row.status] = row.count;
  return stats;
}
