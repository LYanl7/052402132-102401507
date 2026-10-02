import { z } from 'zod';
import type { SQLInputValue } from 'node:sqlite';
import { postInputSchema } from '@mayoimon/shared';
import { userId, AppError } from '../infrastructure/context.ts';
import { getPost, ownedPost, savePost, queryPosts, distanceMeters } from './service.ts';

import { endpoint } from '../infrastructure/http.ts';
const querySchema = z.object({
  q: z.string().max(120).default(''),
  type: z.enum(['lost', 'found']).optional(),
  status: z.enum(['active', 'completed']).optional(),
  category: z.enum(['keys', 'electronics', 'umbrella', 'wallet', 'card', 'other']).optional(),
  days: z.coerce.number().int().min(1).max(365).optional(),
  sort: z.enum(['newest', 'oldest']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const listPosts = endpoint(async (req, ctx) => {
  const p = querySchema.parse(req.query);
  const conditions = ["p.status IN ('active','completed')"];
  const args: SQLInputValue[] = [];
  if (p.q) {
    conditions.push('(instr(p.title,?)>0 OR instr(p.location,?)>0 OR instr(p.description,?)>0)');
    args.push(p.q, p.q, p.q);
  }
  if (p.type) {
    conditions.push('p.type=?');
    args.push(p.type);
  }
  if (p.status) {
    conditions.push('p.status=?');
    args.push(p.status);
  }
  if (p.category) {
    conditions.push('p.category=?');
    args.push(p.category);
  }
  if (p.days) {
    conditions.push('p.created_at>=?');
    args.push(new Date(Date.now() - p.days * 86400000).toISOString());
  }
  const where = conditions.join(' AND ');
  const total = ctx.db.one<{ count: number }>(
    'SELECT COUNT(*) count FROM posts p WHERE p.deleted_at IS NULL AND ' + where,
    ...args,
  )!.count;
  const items = queryPosts(
    ctx.db,
    where +
      ` ORDER BY p.created_at ${p.sort === 'oldest' ? 'ASC' : 'DESC'},p.rowid ${p.sort === 'oldest' ? 'ASC' : 'DESC'} LIMIT ? OFFSET ?`,
    [...args, p.pageSize, (p.page - 1) * p.pageSize],
    req.user?.id,
  );
  return { items, total, page: p.page, pageSize: p.pageSize };
});
export const nearbyPosts = endpoint(async (req, ctx) => {
  const p = z
    .object({
      lat: z.coerce.number().min(-90).max(90),
      lng: z.coerce.number().min(-180).max(180),
      radius: z.coerce.number().min(50).max(50000).default(1500),
      type: z.enum(['lost', 'found']).optional(),
    })
    .parse(req.query);
  const items = queryPosts(
    ctx.db,
    "p.status='active' AND p.lat IS NOT NULL" + (p.type ? ' AND p.type=?' : ''),
    p.type ? [p.type] : [],
    req.user?.id,
  )
    .map((post) => ({ ...post, distance: distanceMeters(p.lat, p.lng, post.lat!, post.lng!) }))
    .filter((pst) => pst.distance <= p.radius)
    .sort((a, b) => a.distance - b.distance);
  return { items, total: items.length };
});
export const myPosts = endpoint(
  async (req, ctx) => {
    const p = z
      .object({ status: z.enum(['active', 'completed', 'draft']).default('active') })
      .parse(req.query);
    return {
      items: queryPosts(
        ctx.db,
        'p.user_id=? AND p.status=? ORDER BY p.updated_at DESC',
        [userId(req), p.status],
        userId(req),
      ),
    };
  },
  { auth: true },
);
export const postDetail = endpoint(async (req, ctx) => ({
  post: getPost(ctx.db, req.params.id, req.user?.id),
}));
export const createPost = endpoint(
  async (req, ctx) => {
    return { post: savePost(ctx.db, postInputSchema.parse(req.body), userId(req)) };
  },
  { auth: true, status: 201 },
);
export const updatePost = endpoint(
  async (req, ctx) => ({
    post: savePost(ctx.db, postInputSchema.parse(req.body), userId(req), req.params.id),
  }),
  { auth: true },
);
export const completePost = endpoint(
  async (req, ctx) => {
    const post = ownedPost(ctx.db, req.params.id, userId(req));
    if (post.status === 'draft') throw new AppError(409, '草稿不能标记完成');
    ctx.db.run(
      "UPDATE posts SET status='completed',updated_at=? WHERE id=?",
      new Date().toISOString(),
      post.id,
    );
    return { post: getPost(ctx.db, post.id, userId(req)) };
  },
  { auth: true },
);
export const deletePost = endpoint(
  async (req, ctx) => {
    ownedPost(ctx.db, req.params.id, userId(req));
    ctx.db.run('UPDATE posts SET deleted_at=? WHERE id=?', new Date().toISOString(), req.params.id);
    return { ok: true };
  },
  { auth: true },
);
