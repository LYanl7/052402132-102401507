import { userId } from '../infrastructure/context.ts';
import { endpoint } from '../infrastructure/http.ts';
import { getPost } from '../message/service.ts';
import { findPersonalPosts } from '../message/repository.ts';
import { createLogger } from '../infrastructure/logger.ts';

const log = createLogger('interaction');
import {
  recordPostView,
  insertFavorite,
  deleteFavorite,
  deleteHistory,
  getProfileStats,
} from './repository.ts';

export const recordView = endpoint(async (req, ctx) => {
  const post = getPost(ctx.db, req.params.id, req.user?.id);
  if (post.status === 'draft') return { ok: true };
  recordPostView(ctx.db, post.id, req.user?.id, new Date().toISOString());
  log.debug('post.viewed', { postId: post.id });
  return { ok: true };
});
export const addFavorite = endpoint(
  async (req, ctx) => {
    getPost(ctx.db, req.params.id, userId(req));
    insertFavorite(ctx.db, userId(req), req.params.id, new Date().toISOString());
    log.info('favorite.added', { postId: req.params.id });
    return { favorite: true };
  },
  { auth: true },
);
export const removeFavorite = endpoint(
  async (req, ctx) => {
    deleteFavorite(ctx.db, userId(req), req.params.id);
    log.info('favorite.removed', { postId: req.params.id });
    return { favorite: false };
  },
  { auth: true },
);
export const clearHistory = endpoint(
  async (req, ctx) => {
    deleteHistory(ctx.db, userId(req));
    log.info('history.cleared');
    return { ok: true };
  },
  { auth: true },
);
export const stats = endpoint((req, ctx) => getProfileStats(ctx.db, userId(req)), { auth: true });

function personalList(kind: 'favorites' | 'history') {
  return endpoint((req, ctx) => ({ items: findPersonalPosts(ctx.db, userId(req), kind) }), {
    auth: true,
  });
}
export const favorites = personalList('favorites');
export const history = personalList('history');
