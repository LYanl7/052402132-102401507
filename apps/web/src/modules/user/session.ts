import { randomBytes } from 'node:crypto';
import type { User } from './models.ts';
import type { Context } from '../infrastructure/models.ts';
import { findSessionUser, insertSession, deleteSession } from './repository.ts';
import { tokenHash } from './security.ts';

export function authenticate(ctx: Context, cookie: string | null | undefined) {
  const token = cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('mayoimon_session='))
    ?.slice('mayoimon_session='.length);
  const sessionHash = token && /^[a-f0-9]{64}$/.test(token) ? tokenHash(token) : null;
  const user = sessionHash ? (findSessionUser(ctx.db, sessionHash, Date.now()) ?? null) : null;
  return { user, sessionHash };
}
export function sessionCookie(ctx: Context, user: User) {
  const token = randomBytes(32).toString('hex');
  const now = Date.now();
  insertSession(ctx.db, tokenHash(token), user.id, now, now + 7 * 86400000);
  return `mayoimon_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${ctx.secureCookie ? '; Secure' : ''}`;
}
export function revokeSession(ctx: Context, hash: string | null) {
  if (!hash) return;
  deleteSession(ctx.db, hash);
  ctx.disconnect(hash);
}
