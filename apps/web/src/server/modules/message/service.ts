import type { Post, PostInput } from '@mayoimon/shared';
import { randomUUID } from 'node:crypto';
import type { SQLInputValue } from 'node:sqlite';
import type { PostRow } from './models.ts';
import { Database } from '../infrastructure/database.ts';
import { AppError } from '../infrastructure/context.ts';

export const selectPosts = `SELECT p.*,u.name author_name,EXISTS(SELECT 1 FROM favorites f WHERE f.post_id=p.id AND f.user_id=?) favorite FROM posts p JOIN users u ON u.id=p.user_id`;
export function mapPost(p: PostRow): Post {
  return {
    id: p.id,
    userId: p.user_id,
    type: p.type,
    title: p.title,
    category: p.category,
    location: p.location,
    occurredAt: p.occurred_at,
    description: p.description,
    contact: p.contact,
    images: JSON.parse(p.images),
    lat: p.lat,
    lng: p.lng,
    status: p.status,
    views: p.views,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    author: { id: p.user_id, name: p.author_name },
    favorite: !!p.favorite,
  };
}
export function getPost(db: Database, id: string, viewer?: string): Post {
  const row = db.one<PostRow>(
    selectPosts + ' WHERE p.id=? AND p.deleted_at IS NULL',
    viewer ?? '',
    id,
  );
  if (!row || (row.status === 'draft' && row.user_id !== viewer))
    throw new AppError(404, '信息不存在');
  return mapPost(row);
}
export function ownedPost(db: Database, id: string, owner: string) {
  const post = getPost(db, id, owner);
  if (post.userId !== owner) throw new AppError(403, '只有发布者可以修改信息');
  return post;
}
export function queryPosts(
  db: Database,
  where: string,
  params: SQLInputValue[],
  viewer: string = '',
) {
  return db
    .all<PostRow>(selectPosts + ' WHERE p.deleted_at IS NULL AND ' + where, viewer, ...params)
    .map(mapPost);
}
export function savePost(db: Database, input: PostInput, owner: string, id?: string) {
  const now = new Date().toISOString();
  const postId = id ?? randomUUID();
  for (const path of input.images)
    if (!db.one('SELECT path FROM uploads WHERE path=? AND user_id=?', path, owner))
      throw new AppError(400, '请使用自己上传的照片');
  if (id) {
    const existing = ownedPost(db, id, owner);
    if (existing.status === 'completed') throw new AppError(409, '已完成的信息不能编辑');
    db.run(
      `UPDATE posts SET type=?,title=?,category=?,location=?,occurred_at=?,description=?,contact=?,images=?,lat=?,lng=?,status=?,updated_at=? WHERE id=?`,
      input.type,
      input.title,
      input.category,
      input.location,
      input.occurredAt,
      input.description,
      input.contact,
      JSON.stringify(input.images),
      input.lat,
      input.lng,
      input.status,
      now,
      id,
    );
  } else
    db.run(
      `INSERT INTO posts(id,user_id,type,title,category,location,occurred_at,description,contact,images,lat,lng,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      postId,
      owner,
      input.type,
      input.title,
      input.category,
      input.location,
      input.occurredAt,
      input.description,
      input.contact,
      JSON.stringify(input.images),
      input.lat,
      input.lng,
      input.status,
      now,
      now,
    );
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
