import { randomUUID } from 'node:crypto';
import { credentialsSchema, registerSchema, profileSchema } from './schemas.ts';
import { AppError, userId } from '../infrastructure/context.ts';
import { endpoint, json } from '../infrastructure/http.ts';
import { findUserByEmail, insertUser, saveProfile } from './repository.ts';
import { hashPassword, checkPassword } from './security.ts';
import { sessionCookie, revokeSession } from './session.ts';

export const register = endpoint(
  async (req, ctx) => {
    const p = registerSchema.parse(req.body);
    const email = p.email.toLowerCase();
    const password = await hashPassword(p.password);
    if (findUserByEmail(ctx.db, email)) throw new AppError(409, '该邮箱已注册');
    const user = { id: randomUUID(), email, name: p.name, bio: '愿每件失物都能回家' };
    insertUser(ctx.db, { ...user, passwordHash: password, createdAt: new Date().toISOString() });
    revokeSession(ctx, req.sessionHash);
    return json({ user }, 201, { 'Set-Cookie': sessionCookie(ctx, user) });
  },
  { rate: 10 },
);
export const login = endpoint(
  async (req, ctx) => {
    const p = credentialsSchema.parse(req.body);
    const row = findUserByEmail(ctx.db, p.email.toLowerCase());
    const ok = await checkPassword(
      p.password,
      row?.passwordHash ?? '00000000000000000000000000000000:' + '00'.repeat(64),
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
    saveProfile(ctx.db, userId(req), p);
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
