import { AsyncLocalStorage } from 'node:async_hooks';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFields = Record<string, unknown>;
export interface LoggerOptions {
  level?: LogLevel | 'silent';
  bindings?: LogFields;
  sink?: (line: string, level: LogLevel) => void;
}
export interface Logger {
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
  child(bindings: LogFields): Logger;
}

const priorities = { debug: 10, info: 20, warn: 30, error: 40, silent: Infinity };
// The custom server and Next's bundled routes must use the same async context.
const contextKey = Symbol.for('mayoimon.log-context');
const globals = globalThis as typeof globalThis & {
  [contextKey]?: AsyncLocalStorage<LogFields>;
};
const context = (globals[contextKey] ??= new AsyncLocalStorage<LogFields>());

export function getLogContext(): Readonly<LogFields> | undefined {
  return context.getStore();
}

export function withLogContext<T>(fields: LogFields, work: () => T): T {
  return context.run({ ...context.getStore(), ...fields }, work);
}

const sensitive =
  /(password|passwd|token|secret|cookie|authorization|sessionhash|apikey|privatekey|credential)|^(email|content|body|payload|headers|query|contact)$/i;
function sanitize(value: unknown, seen = new WeakSet<object>(), depth = 0): unknown {
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'function' || typeof value === 'symbol') return '[Unsupported]';
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  if (depth >= 8) return '[Truncated]';
  seen.add(value);
  try {
    if (value instanceof Error) {
      return sanitize(
        {
          name: value.name,
          message: value.message,
          stack: value.stack,
          cause: value.cause,
          ...('code' in value ? { code: value.code } : {}),
        },
        seen,
        depth + 1,
      );
    }
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map((item) => sanitize(item, seen, depth + 1));
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        sensitive.test(key.replace(/[-_]/g, '')) ? '[REDACTED]' : sanitize(item, seen, depth + 1),
      ]),
    );
  } finally {
    seen.delete(value);
  }
}

function defaultSink(line: string, level: LogLevel) {
  (level === 'warn' || level === 'error' ? process.stderr : process.stdout).write(line + '\n');
}

/** Server/test logger. Events are fixed names; user input belongs in approved fields only. */
export function createLogger(scope: string, options: LoggerOptions = {}): Logger {
  function write(level: LogLevel, event: string, fields: LogFields = {}) {
    // Logging failure must never turn a committed operation into an API failure.
    try {
      const configured = options.level ?? process.env.LOG_LEVEL ?? 'info';
      const threshold = Object.hasOwn(priorities, configured)
        ? priorities[configured as keyof typeof priorities]
        : priorities.info;
      if (priorities[level] < threshold) return;
      const record = {
        ...context.getStore(),
        ...options.bindings,
        ...fields,
        timestamp: new Date().toISOString(),
        level,
        scope,
        event,
      };
      (options.sink ?? defaultSink)(JSON.stringify(sanitize(record)), level);
    } catch {
      // Includes cyclic/custom values and unavailable output destinations.
    }
  }
  return {
    debug: (event, fields) => write('debug', event, fields),
    info: (event, fields) => write('info', event, fields),
    warn: (event, fields) => write('warn', event, fields),
    error: (event, fields) => write('error', event, fields),
    child: (bindings) =>
      createLogger(scope, { ...options, bindings: { ...options.bindings, ...bindings } }),
  };
}
