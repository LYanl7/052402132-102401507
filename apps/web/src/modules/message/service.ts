import type { Post, PostInput } from './models.ts';
import { randomUUID } from 'node:crypto';
import type { Database } from '../infrastructure/database.ts';
import { AppError } from '../infrastructure/context.ts';
import { ownsUpload } from '../infrastructure/upload-repository.ts';
import { findPost, insertPost, updatePostData } from './repository.ts';

export function getPost(db: Database, id: string, viewer?: string): Post {
  const post = findPost(db, id, viewer);
  if (!post || (post.status === 'draft' && post.userId !== viewer))
    throw new AppError(404, '信息不存在');
  return post;
}
export function ownedPost(db: Database, id: string, owner: string) {
  const post = getPost(db, id, owner);
  if (post.userId !== owner) throw new AppError(403, '只有发布者可以修改信息');
  return post;
}
export function savePost(db: Database, input: PostInput, owner: string, id?: string) {
  const now = new Date().toISOString();
  const postId = id ?? randomUUID();
  for (const path of input.images)
    if (!ownsUpload(db, path, owner)) throw new AppError(400, '请使用自己上传的照片');
  if (id) {
    const existing = ownedPost(db, id, owner);
    if (existing.status === 'completed') throw new AppError(409, '已完成的信息不能编辑');
    updatePostData(db, id, input, now);
  } else {
    insertPost(db, { ...input, id: postId, userId: owner, createdAt: now, updatedAt: now });
  }
  return getPost(db, postId, owner);
}
export function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = Math.PI / 180;
  const dlat = (bLat - aLat) * rad,
    dlng = (bLng - aLng) * rad;
  const v =
    Math.sin(dlat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dlng / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(v), Math.sqrt(1 - v)));
}
