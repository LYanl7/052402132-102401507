import { querySchema, nearbyQuerySchema, myPostsQuerySchema } from './schemas.ts';
import { postInputSchema } from './schemas.ts';
import { userId, AppError } from '../infrastructure/context.ts';
import { getPost, ownedPost, savePost, distanceMeters } from './service.ts';

import {
  searchPosts,
  findNearbyPosts,
  findOwnedPosts,
  setPostCompleted,
  softDeletePost,
} from './repository.ts';
import { endpoint } from '../infrastructure/http.ts';
export const listPosts = endpoint(async (req, ctx) => {
  const p = querySchema.parse(req.query);
  return searchPosts(ctx.db, p, req.user?.id);
});
export const nearbyPosts = endpoint(async (req, ctx) => {
  const p = nearbyQuerySchema.parse(req.query);
  const items = findNearbyPosts(ctx.db, p.type, req.user?.id)
    .map((post) => ({ ...post, distance: distanceMeters(p.lat, p.lng, post.lat!, post.lng!) }))
    .filter((pst) => pst.distance <= p.radius)
    .sort((a, b) => a.distance - b.distance);
  return { items, total: items.length };
});
export const myPosts = endpoint(
  async (req, ctx) => {
    const p = myPostsQuerySchema.parse(req.query);
    return {
      items: findOwnedPosts(ctx.db, userId(req), p.status),
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
    setPostCompleted(ctx.db, post.id, new Date().toISOString());
    return { post: getPost(ctx.db, post.id, userId(req)) };
  },
  { auth: true },
);
export const deletePost = endpoint(
  async (req, ctx) => {
    ownedPost(ctx.db, req.params.id, userId(req));
    softDeletePost(ctx.db, req.params.id, new Date().toISOString());
    return { ok: true };
  },
  { auth: true },
);
