import { randomBytes } from 'node:crypto';
import type { User } from '@mayoimon/shared';
import type { Context } from '../infrastructure/models.ts';
import { tokenHash } from './security.ts';

export function authenticate(ctx: Context, cookie: string | null | undefined) {
  const token = cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('mayoimon_session='))
    ?.slice('mayoimon_session='.length);
  const sessionHash = token && /^[a-f0-9]{64}$/.test(token) ? tokenHash(token) : null;
  const user = sessionHash
    ? (ctx.db.one<User>(
        'SELECT u.id,u.email,u.name,u.bio FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?',
        sessionHash,
        Date.now(),
      ) ?? null)
    : null;
  return { user, sessionHash };
}
export function sessionCookie(ctx: Context, user: User) {
  const token = randomBytes(32).toString('hex');
  ctx.db.run('DELETE FROM sessions WHERE expires_at<=?', Date.now());
  ctx.db.run(
    'INSERT INTO sessions VALUES(?,?,?)',
    tokenHash(token),
    user.id,
    Date.now() + 7 * 86400000,
  );
  return `mayoimon_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${ctx.secureCookie ? '; Secure' : ''}`;
}
export function revokeSession(ctx: Context, hash: string | null) {
  if (!hash) return;
  ctx.db.run('DELETE FROM sessions WHERE token_hash=?', hash);
  ctx.disconnect(hash);
}
