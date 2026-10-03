import { and, eq } from 'drizzle-orm';
import type { Database } from './database.ts';
import { uploads } from './schema.ts';

export function ownsUpload(db: Database, path: string, userId: string) {
  return !!db.orm
    .select({ path: uploads.path })
    .from(uploads)
    .where(and(eq(uploads.path, path), eq(uploads.userId, userId)))
    .get();
}
export function insertUpload(db: Database, path: string, userId: string, createdAt: string) {
  db.orm.insert(uploads).values({ path, userId, createdAt }).run();
}
