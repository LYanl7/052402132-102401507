import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  getTableColumns,
  gte,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { Post, PostInput } from './models.ts';
import type { Database } from '../infrastructure/database.ts';
import { posts } from './schema.ts';
import { users } from '../user/schema.ts';
import { favorites, history } from '../interaction/schema.ts';
import type { NewPostRow, PostQuery } from './models.ts';

// SQLite's existing hidden rowid remains the tie breaker; never rebuild the table.
const postRowid = sql<number>`${posts}.rowid`;
function selectPosts(db: Database, viewer = '') {
  const { deletedAt: _deletedAt, ...columns } = getTableColumns(posts);
  const favorite = db.orm
    .select({ id: favorites.postId })
    .from(favorites)
    .where(and(eq(favorites.postId, posts.id), eq(favorites.userId, viewer)));
  return db.orm
    .select({
      ...columns,
      author: { id: users.id, name: users.name },
      favorite: sql<boolean>`${exists(favorite)}`.mapWith(Boolean),
    })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.userId));
}
export function findPost(db: Database, id: string, viewer?: string): Post | undefined {
  return selectPosts(db, viewer)
    .where(and(eq(posts.id, id), isNull(posts.deletedAt)))
    .get();
}
export function searchPosts(db: Database, input: PostQuery, viewer?: string) {
  const conditions: (SQL | undefined)[] = [
    isNull(posts.deletedAt),
    inArray(posts.status, ['active', 'completed']),
  ];
  if (input.q)
    conditions.push(
      or(
        sql`instr(${posts.title}, ${input.q}) > 0`,
        sql`instr(${posts.location}, ${input.q}) > 0`,
        sql`instr(${posts.description}, ${input.q}) > 0`,
      ),
    );
  if (input.type) conditions.push(eq(posts.type, input.type));
  if (input.status) conditions.push(eq(posts.status, input.status));
  if (input.category) conditions.push(eq(posts.category, input.category));
  if (input.days)
    conditions.push(
      gte(posts.createdAt, new Date(Date.now() - input.days * 86400000).toISOString()),
    );
  const where = and(...conditions);
  const total = db.orm.select({ count: count() }).from(posts).where(where).get()!.count;
  const order = input.sort === 'oldest' ? asc : desc;
  const items = selectPosts(db, viewer)
    .where(where)
    .orderBy(order(posts.createdAt), order(postRowid))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize)
    .all();
  return { items, total, page: input.page, pageSize: input.pageSize };
}
export function findNearbyPosts(
  db: Database,
  type: PostInput['type'] | undefined,
  viewer?: string,
) {
  return selectPosts(db, viewer)
    .where(
      and(
        isNull(posts.deletedAt),
        eq(posts.status, 'active'),
        isNotNull(posts.lat),
        isNotNull(posts.lng),
        eq(posts.coordinateSystem, 'bd09'),
        type ? eq(posts.type, type) : undefined,
      ),
    )
    .all();
}
export function findOwnedPosts(db: Database, owner: string, status: Post['status']) {
  return selectPosts(db, owner)
    .where(and(isNull(posts.deletedAt), eq(posts.userId, owner), eq(posts.status, status)))
    .orderBy(desc(posts.updatedAt))
    .all();
}
export function findPersonalPosts(db: Database, owner: string, kind: 'favorites' | 'history') {
  const table = kind === 'favorites' ? favorites : history;
  const timestamp = kind === 'favorites' ? favorites.createdAt : history.viewedAt;
  return selectPosts(db, owner)
    .innerJoin(table, and(eq(table.postId, posts.id), eq(table.userId, owner)))
    .where(and(isNull(posts.deletedAt), inArray(posts.status, ['active', 'completed'])))
    .orderBy(desc(timestamp))
    .all();
}
export function insertPost(db: Database, post: NewPostRow) {
  db.orm.insert(posts).values(post).run();
}
export function updatePostData(db: Database, id: string, input: PostInput, updatedAt: string) {
  db.orm
    .update(posts)
    .set({ ...input, updatedAt })
    .where(eq(posts.id, id))
    .run();
}
export function setPostCompleted(db: Database, id: string, updatedAt: string) {
  db.orm.update(posts).set({ status: 'completed', updatedAt }).where(eq(posts.id, id)).run();
}
export function softDeletePost(db: Database, id: string, deletedAt: string) {
  db.orm.update(posts).set({ deletedAt }).where(eq(posts.id, id)).run();
}
