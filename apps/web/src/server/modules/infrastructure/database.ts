import BetterSqlite3 from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import * as schema from './schema.ts';
import { migrationTableSql, initialSchemaSql } from './migrations/0001-initial.ts';

export class Database {
  private readonly connection: BetterSqlite3.Database;
  readonly orm: BetterSQLite3Database<typeof schema>;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.connection = new BetterSqlite3(path);
    this.orm = drizzle(this.connection, { schema });
    try {
      this.connection.pragma('foreign_keys = ON');
      this.connection.pragma('journal_mode = WAL');
      this.connection.pragma('busy_timeout = 5000');
      this.connection.exec(migrationTableSql);
      this.orm.transaction(
        (tx) => {
          if (
            !tx
              .select()
              .from(schema.schemaMigrations)
              .where(eq(schema.schemaMigrations.version, 1))
              .get()
          ) {
            // Preserve the original v1 schema and ledger when opening existing files.
            this.connection.exec(initialSchemaSql);
            tx.insert(schema.schemaMigrations)
              .values({ version: 1, appliedAt: new Date().toISOString() })
              .run();
          }
        },
        { behavior: 'immediate' },
      );
    } catch (error) {
      this.connection.close();
      throw error;
    }
  }
  close() {
    this.connection.close();
  }
}
