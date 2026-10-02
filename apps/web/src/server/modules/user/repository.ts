import { and, eq, gt, lte } from 'drizzle-orm';
import type { Database } from '../infrastructure/database.ts';
import { users, sessions } from '../infrastructure/schema.ts';
import type { NewUserRow } from './models.ts';

const publicUser = { id: users.id, email: users.email, name: users.name, bio: users.bio };

export function findUserByEmail(db: Database, email: string) {
  return db.orm.select().from(users).where(eq(users.email, email)).get();
}
export function insertUser(db: Database, user: NewUserRow) {
  db.orm.insert(users).values(user).run();
}
export function saveProfile(db: Database, id: string, profile: { name: string; bio: string }) {
  db.orm.update(users).set(profile).where(eq(users.id, id)).run();
}
export function findSessionUser(db: Database, hash: string, now: number) {
  return db.orm
    .select(publicUser)
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hash), gt(sessions.expiresAt, now)))
    .get();
}
export function hasValidSession(db: Database, hash: string, now: number) {
  return !!db.orm
    .select({ hash: sessions.tokenHash })
    .from(sessions)
    .where(and(eq(sessions.tokenHash, hash), gt(sessions.expiresAt, now)))
    .get();
}
export function insertSession(
  db: Database,
  hash: string,
  userId: string,
  now: number,
  expiresAt: number,
) {
  db.orm.transaction(
    (tx) => {
      tx.delete(sessions).where(lte(sessions.expiresAt, now)).run();
      tx.insert(sessions).values({ tokenHash: hash, userId, expiresAt }).run();
    },
    { behavior: 'immediate' },
  );
}
export function deleteSession(db: Database, hash: string) {
  db.orm.delete(sessions).where(eq(sessions.tokenHash, hash)).run();
}
