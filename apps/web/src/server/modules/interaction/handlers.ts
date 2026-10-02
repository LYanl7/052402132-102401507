import { userId } from '../infrastructure/context.ts';
import { getPost, queryPosts } from '../message/service.ts';

import { endpoint } from '../infrastructure/http.ts';
export const recordView = endpoint(async (req, ctx) => {
  const post = getPost(ctx.db, req.params.id, req.user?.id);
  if (post.status === 'draft') return { ok: true };
  ctx.db.transaction(() => {
    ctx.db.run('UPDATE posts SET views=views+1 WHERE id=?', post.id);
    if (req.user)
      ctx.db.run(
        'INSERT INTO history VALUES(?,?,?) ON CONFLICT(user_id,post_id) DO UPDATE SET viewed_at=excluded.viewed_at',
        req.user.id,
        post.id,
        new Date().toISOString(),
      );
  });
  return { ok: true };
});
export const addFavorite = endpoint(
  async (req, ctx) => {
    getPost(ctx.db, req.params.id, userId(req));
    ctx.db.run(
      'INSERT OR IGNORE INTO favorites VALUES(?,?,?)',
      userId(req),
      req.params.id,
      new Date().toISOString(),
    );
    return { favorite: true };
  },
  { auth: true },
);
export const removeFavorite = endpoint(
  async (req, ctx) => {
    ctx.db.run('DELETE FROM favorites WHERE user_id=? AND post_id=?', userId(req), req.params.id);
    return { favorite: false };
  },
  { auth: true },
);
export const clearHistory = endpoint(
  async (req, ctx) => {
    ctx.db.run('DELETE FROM history WHERE user_id=?', userId(req));
    return { ok: true };
  },
  { auth: true },
);
export const stats = endpoint(
  async (req, ctx) => {
    const owner = userId(req);
    const stats = { history: 0, favorites: 0, active: 0, completed: 0, drafts: 0 };
    for (const table of ['history', 'favorites'] as const)
      stats[table] = ctx.db.one<{ count: number }>(
        `SELECT COUNT(*) count FROM ${table} i JOIN posts p ON p.id=i.post_id WHERE i.user_id=? AND p.deleted_at IS NULL AND p.status<>'draft'`,
        owner,
      )!.count;
    for (const row of ctx.db.all<{ status: 'active' | 'completed' | 'draft'; count: number }>(
      'SELECT status,COUNT(*) count FROM posts WHERE user_id=? AND deleted_at IS NULL GROUP BY status',
      owner,
    ))
      stats[row.status === 'draft' ? 'drafts' : row.status] = row.count;
    return stats;
  },
  { auth: true },
);

function personalList(table: 'favorites' | 'history', time: 'created_at' | 'viewed_at') {
  return endpoint(
    (req, ctx) => ({
      items: queryPosts(
        ctx.db,
        `p.status<>'draft' AND p.id IN (SELECT post_id FROM ${table} WHERE user_id=?) ORDER BY (SELECT ${time} FROM ${table} i WHERE i.post_id=p.id AND i.user_id=?) DESC`,
        [userId(req), userId(req)],
        userId(req),
      ),
    }),
    { auth: true },
  );
}
export const favorites = personalList('favorites', 'created_at');
export const history = personalList('history', 'viewed_at');
