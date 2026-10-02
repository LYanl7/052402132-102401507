import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { Database } from './modules/infrastructure/database.ts';
import { AppError, type Context } from './modules/infrastructure/context.ts';

export interface RuntimeOptions {
  databasePath?: string;
  dataDir?: string;
  origins?: string[];
  secureCookie?: boolean;
}
// Next bundles Route Handlers separately from the custom server. Both share this
// process-global runtime, so HTTP writes reach the same WebSocket subscribers.
const runtimeKey = Symbol.for('mayoimon.runtime');
const globals = globalThis as typeof globalThis & { [runtimeKey]?: Context };
export function createRuntime(options: RuntimeOptions = {}): Context {
  // Local mutable data is supplied at runtime, outside the Next build output.
  const dataDir = resolve(
    /* turbopackIgnore: true */ options.dataDir ?? process.env.DATA_DIR ?? '../../data',
  );
  mkdirSync(join(dataDir, 'uploads'), { recursive: true });
  const db = new Database(options.databasePath ?? join(dataDir, 'mayoimon.sqlite'));
  const counters = new Map<string, { count: number; expires: number }>();
  let nextSweep = 0;
  return {
    db,
    dataDir,
    origins:
      options.origins ??
      (process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000,http://127.0.0.1:3000')
        .split(',')
        .map((o) => o.trim()),
    secureCookie: options.secureCookie ?? process.env.COOKIE_SECURE === 'true',
    emit: () => {},
    disconnect: () => {},
    limit(key, max) {
      const now = Date.now();
      if (now >= nextSweep) {
        for (const [id, value] of counters) if (value.expires <= now) counters.delete(id);
        nextSweep = now + 60000;
      }
      let value = counters.get(key);
      if (!value || value.expires <= now) {
        value = { count: 0, expires: now + 60000 };
        counters.set(key, value);
      }
      if (++value.count > max) throw new AppError(429, '操作太频繁，请稍后重试');
    },
  };
}
export function getRuntime(): Context {
  return (globals[runtimeKey] ??= createRuntime());
}
export function setRuntime(runtime: Context) {
  globals[runtimeKey] = runtime;
}
export function closeRuntime() {
  const runtime = globals[runtimeKey];
  delete globals[runtimeKey];
  runtime?.db.close();
}
