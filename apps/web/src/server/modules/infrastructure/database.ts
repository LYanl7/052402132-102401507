import { migrationTableSql, initialSchemaSql } from './schema.ts';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class Database {
  readonly connection: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.connection = new DatabaseSync(path);
    this.connection.exec(
      'PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;',
    );
    this.connection.exec(migrationTableSql);
    if (!this.one('SELECT version FROM schema_migrations WHERE version=1'))
      this.transaction(() => {
        this.connection.exec(initialSchemaSql);
        this.run('INSERT INTO schema_migrations VALUES(1,?)', new Date().toISOString());
      });
  }
  one<T = Record<string, unknown>>(sql: string, ...params: SQLInputValue[]): T | undefined {
    return this.connection.prepare(sql).get(...params) as T | undefined;
  }
  all<T = Record<string, unknown>>(sql: string, ...params: SQLInputValue[]): T[] {
    return this.connection.prepare(sql).all(...params) as T[];
  }
  run(sql: string, ...params: SQLInputValue[]) {
    return this.connection.prepare(sql).run(...params);
  }
  transaction<T>(action: () => T): T {
    this.connection.exec('BEGIN IMMEDIATE');
    try {
      const result = action();
      this.connection.exec('COMMIT');
      return result;
    } catch (error) {
      this.connection.exec('ROLLBACK');
      throw error;
    }
  }
  close() {
    this.connection.close();
  }
}
