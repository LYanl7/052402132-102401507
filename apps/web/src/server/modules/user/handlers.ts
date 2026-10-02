import { randomUUID } from 'node:crypto';
import { credentialsSchema, registerSchema, profileSchema } from '@mayoimon/shared';
import { AppError, userId } from '../infrastructure/context.ts';
import { endpoint, json } from '../infrastructure/http.ts';
import type { UserRow } from './models.ts';
import { hashPassword, checkPassword } from './security.ts';
import { sessionCookie, revokeSession } from './session.ts';

export const register = endpoint(
  async (req, ctx) => {
    const p = registerSchema.parse(req.body);
    const email = p.email.toLowerCase();
    const password = await hashPassword(p.password);
    if (ctx.db.one('SELECT id FROM users WHERE email=?', email))
      throw new AppError(409, '该邮箱已注册');
    const user = { id: randomUUID(), email, name: p.name, bio: '愿每件失物都能回家' };
    ctx.db.run(
      'INSERT INTO users(id,email,password_hash,name,bio,created_at) VALUES(?,?,?,?,?,?)',
      user.id,
      email,
      password,
      p.name,
      user.bio,
      new Date().toISOString(),
    );
    revokeSession(ctx, req.sessionHash);
    return json({ user }, 201, { 'Set-Cookie': sessionCookie(ctx, user) });
  },
  { rate: 10 },
);
export const login = endpoint(
  async (req, ctx) => {
    const p = credentialsSchema.parse(req.body);
    const row = ctx.db.one<UserRow>('SELECT * FROM users WHERE email=?', p.email.toLowerCase());
    const ok = await checkPassword(
      p.password,
      row?.password_hash ?? '00000000000000000000000000000000:' + '00'.repeat(64),
    );
    if (!row || !ok) throw new AppError(401, '邮箱或密码错误');
    revokeSession(ctx, req.sessionHash);
    const user = { id: row.id, email: row.email, name: row.name, bio: row.bio };
    return json({ user }, 200, { 'Set-Cookie': sessionCookie(ctx, user) });
  },
  { rate: 10 },
);
export const me = endpoint((req) => ({ user: req.user }));
export const updateProfile = endpoint(
  (req, ctx) => {
    const p = profileSchema.parse(req.body);
    ctx.db.run('UPDATE users SET name=?,bio=? WHERE id=?', p.name, p.bio, userId(req));
    return { user: { ...req.user, ...p } };
  },
  { auth: true },
);
export const logout = endpoint((req, ctx) => {
  revokeSession(ctx, req.sessionHash);
  return json({ ok: true }, 200, {
    'Set-Cookie': `mayoimon_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${ctx.secureCookie ? '; Secure' : ''}`,
  });
});
