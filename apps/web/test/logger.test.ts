import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate as nextTick } from 'node:timers/promises';
import {
  createLogger,
  getLogContext,
  withLogContext,
} from '../src/modules/infrastructure/logger.ts';

function capture(level: 'debug' | 'info' | 'warn' | 'error' | 'silent' = 'debug') {
  const lines: string[] = [];
  const log = createLogger('test', { level, sink: (line) => lines.push(line) });
  return { log, lines, records: () => lines.map((line) => JSON.parse(line)) };
}

test('Log filtering and child bindings keep fixed metadata intact', () => {
  const { log, records } = capture('warn');
  log.debug('debug');
  log.info('info');
  log.child({ taskId: 'task-1' }).warn('warning', { level: 'info', scope: 'fake', event: 'fake' });
  log.error('failure');
  const [warning, failure] = records();
  assert.equal(records().length, 2);
  assert.equal(warning.taskId, 'task-1');
  assert.equal(warning.level, 'warn');
  assert.equal(warning.scope, 'test');
  assert.equal(warning.event, 'warning');
  assert.ok(Number.isFinite(Date.parse(warning.timestamp)));
  assert.equal(failure.level, 'error');
  const muted = capture('silent');
  muted.log.error('hidden');
  assert.equal(muted.lines.length, 0);
});

test('LOG_LEVEL is read at write time, with invalid values falling back to info', (t) => {
  const prior = process.env.LOG_LEVEL;
  t.after(() => {
    if (prior === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = prior;
  });
  const lines: string[] = [];
  const log = createLogger('config', { sink: (line) => lines.push(line) });
  process.env.LOG_LEVEL = 'silent';
  log.error('hidden');
  process.env.LOG_LEVEL = 'debug';
  log.debug('visible');
  process.env.LOG_LEVEL = 'invalid';
  log.debug('hidden');
  log.info('fallback');
  assert.deepEqual(
    lines.map((line) => JSON.parse(line).event),
    ['visible', 'fallback'],
  );
});

test('Sensitive fields are redacted recursively without mutating business data', () => {
  const { log, lines, records } = capture();
  const data = {
    password: 'password-value',
    nested: [{ access_token: 'token-value', 'Set-Cookie': 'cookie-value', content: 'chat-value' }],
    email: 'private@example.com',
    body: { private: 'body-value' },
    sessionHash: 'session-value',
    password_hash: 'hash-value',
    authorization: 'authorization-value',
    safe: 'operation-id',
    toJSON: () => ({ password: 'serializer-value' }),
  };
  log.info('redacted', data);
  for (const secret of [
    'password-value',
    'token-value',
    'cookie-value',
    'chat-value',
    'private@example.com',
    'body-value',
    'session-value',
    'hash-value',
    'authorization-value',
    'serializer-value',
  ])
    assert.equal(lines[0].includes(secret), false);
  assert.equal(records()[0].nested[0].content, '[REDACTED]');
  assert.equal(records()[0].safe, 'operation-id');
  assert.equal(data.password, 'password-value');
});

test('Errors retain stack and cause; circular data and bigint remain serializable', () => {
  const { log, records } = capture();
  const root = Object.assign(new Error('root failure'), { code: 'SQLITE_BUSY' });
  const error = new Error('outer failure', { cause: root });
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  log.error('failed', { error, circular, count: 123n });
  const [record] = records();
  assert.equal(record.error.message, 'outer failure');
  assert.match(record.error.stack, /outer failure/);
  assert.equal(record.error.cause.message, 'root failure');
  assert.equal(record.error.cause.code, 'SQLITE_BUSY');
  assert.equal(record.circular.self, '[Circular]');
  assert.equal(record.count, '123');
});

test('Concurrent async contexts and nested bindings do not leak into each other', async () => {
  const { log, records } = capture();
  await Promise.all(
    ['a', 'b'].map((requestId) =>
      withLogContext({ requestId }, async () => {
        await nextTick();
        withLogContext({ userId: requestId + '-user' }, () => log.info('inner'));
        log.info('outer');
      }),
    ),
  );
  for (const requestId of ['a', 'b']) {
    const pair = records().filter((record) => record.requestId === requestId);
    assert.equal(pair.length, 2);
    assert.equal(pair[0].userId, requestId + '-user');
    assert.equal(pair[1].userId, undefined);
  }
  assert.equal(getLogContext(), undefined);
});

test('A socket child identity takes precedence over the triggering HTTP user', () => {
  const { log, records } = capture();
  const socketLog = log.child({ userId: 'recipient', connectionId: 'connection-1' });
  withLogContext({ requestId: 'request-1', userId: 'sender' }, () => {
    socketLog.debug('socket.message_delivered');
  });
  const [record] = records();
  assert.equal(record.userId, 'recipient');
  assert.equal(record.requestId, 'request-1');
  assert.equal(record.connectionId, 'connection-1');
});

test('A broken output destination or field getter cannot fail a business operation', () => {
  const log = createLogger('broken', {
    level: 'debug',
    sink: () => {
      throw new Error('disk full');
    },
  });
  assert.doesNotThrow(() => log.error('failed', { id: 1 }));
  const { log: safe, lines } = capture();
  assert.doesNotThrow(() =>
    safe.info('failed', {
      get id() {
        throw new Error('getter');
      },
    }),
  );
  assert.equal(lines.length, 0);
});
