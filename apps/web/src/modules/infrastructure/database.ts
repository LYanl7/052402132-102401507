import BetterSqlite3 from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import * as infrastructureSchema from './schema.ts';
import * as userSchema from '../user/schema.ts';
import * as messageSchema from '../message/schema.ts';
import * as interactionSchema from '../interaction/schema.ts';
import * as chatSchema from '../private-chat/schema.ts';

const schema = {
  ...infrastructureSchema,
  ...userSchema,
  ...messageSchema,
  ...interactionSchema,
  ...chatSchema,
};
import { migrationTableSql, initialSchemaSql } from './migrations/0001-initial.ts';
import { chatDeliverySql } from './migrations/0002-chat-delivery.ts';
import { postCoordinatesSql } from './migrations/0003-post-coordinates.ts';
import { createLogger } from './logger.ts';

const log = createLogger('database');

export class Database {
  private readonly connection: BetterSqlite3.Database;
  readonly orm: BetterSQLite3Database<typeof schema>;

  constructor(path: string) {
    const started = performance.now();
    const applied: number[] = [];
    let connection: BetterSqlite3.Database | undefined;
    try {
      if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
      connection = new BetterSqlite3(path);
      this.connection = connection;
      this.orm = drizzle(this.connection, { schema });
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
            applied.push(1);
          }
          if (
            !tx
              .select()
              .from(schema.schemaMigrations)
              .where(eq(schema.schemaMigrations.version, 2))
              .get()
          ) {
            this.connection.exec(chatDeliverySql);
            tx.insert(schema.schemaMigrations)
              .values({ version: 2, appliedAt: new Date().toISOString() })
              .run();
            applied.push(2);
          }
          if (
            !tx
              .select()
              .from(schema.schemaMigrations)
              .where(eq(schema.schemaMigrations.version, 3))
              .get()
          ) {
            this.connection.exec(postCoordinatesSql);
            tx.insert(schema.schemaMigrations)
              .values({ version: 3, appliedAt: new Date().toISOString() })
              .run();
            applied.push(3);
          }
        },
        { behavior: 'immediate' },
      );
      for (const version of applied) log.info('database.migrated', { version });
      log.info('database.opened', { durationMs: Math.round(performance.now() - started) });
    } catch (error) {
      connection?.close();
      log.error('database.initialization_failed', { error });
      throw error;
    }
  }
  close() {
    this.connection.close();
    log.info('database.closed');
  }
}
