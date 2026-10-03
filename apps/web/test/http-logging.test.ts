import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { setImmediate as nextTick } from 'node:timers/promises';
import { z } from 'zod';
import { createRuntime, setRuntime, closeRuntime } from '../src/server/runtime.ts';
import { endpoint } from '../src/modules/infrastructure/http.ts';
import { AppError } from '../src/modules/infrastructure/context.ts';
import { createLogger } from '../src/modules/infrastructure/logger.ts';

test('HTTP logs correlate concurrent operations, classify errors and preserve responses', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'mayoimon-log-test-'));
  setRuntime(createRuntime({ dataDir: dir }));
  t.after(() => {
    closeRuntime();
    assert.ok(resolve(dir).startsWith(resolve(tmpdir()) + sep));
    rmSync(dir, { recursive: true, force: true });
  });
  const priorLevel = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'debug';
  t.after(() => {
    if (priorLevel === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = priorLevel;
  });
  const lines: string[] = [];
  const intercept =
    (original: typeof process.stdout.write) =>
    (...args: unknown[]) => {
      if (typeof args[0] === 'string' && args[0].startsWith('{')) {
        lines.push(args[0]);
        return true;
      }
      return Reflect.apply(original, undefined, args) as boolean;
    };
  t.mock.method(process.stdout, 'write', intercept(process.stdout.write.bind(process.stdout)));
  t.mock.method(process.stderr, 'write', intercept(process.stderr.write.bind(process.stderr)));
  const log = createLogger('business-test');
  const handler = endpoint(async (req) => {
    await nextTick();
    log.info('operation.done', { itemId: req.query.item });
    return Response.redirect('http://localhost/next', 302);
  });
  const responses = await Promise.all(
    ['a', 'b'].map((item) =>
      handler(
        new Request(`http://localhost/api/test?item=${item}&password=private-query`, {
          headers: { cookie: 'private-cookie' },
        }),
      ),
    ),
  );
  const records = () => lines.map((line) => JSON.parse(line));
  for (const [i, response] of responses.entries()) {
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), 'http://localhost/next');
    const requestId = response.headers.get('x-request-id');
    assert.ok(requestId);
    const events = records().filter((record) => record.requestId === requestId);
    assert.deepEqual(
      events.map((record) => record.event),
      ['operation.done', 'http.completed'],
    );
    assert.equal(events[0].itemId, i === 0 ? 'a' : 'b');
    assert.equal(events[1].path, '/api/test');
    assert.equal(events[1].level, 'info');
    assert.ok(events[1].durationMs >= 0);
  }
  assert.notEqual(
    responses[0].headers.get('x-request-id'),
    responses[1].headers.get('x-request-id'),
  );
  const request = () => new Request('http://localhost/api/test');
  const validation = await endpoint(() => z.string().parse(42))(request());
  const unauthorized = await endpoint(() => ({ ok: true }), { auth: true })(request());
  const limited = await endpoint(() => {
    throw new AppError(429, 'rate limit');
  })(request());
  const failed = await endpoint(() => {
    throw new Error('test failure');
  })(request());
  assert.equal(validation.status, 400);
  assert.equal(unauthorized.status, 401);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '60');
  assert.equal(failed.status, 500);
  assert.deepEqual(await failed.json(), { error: { message: '服务暂时不可用，请稍后重试' } });
  for (const response of [validation, unauthorized, limited, failed]) {
    const record = records().find(
      (record) => record.requestId === response.headers.get('x-request-id'),
    );
    assert.equal(record.status, response.status);
    assert.equal(record.level, response.status === 500 ? 'error' : 'warn');
    if (response.status === 500) assert.match(record.error.stack, /test failure/);
    else assert.equal(record.error, undefined);
  }
  assert.equal(lines.join('').includes('private-query'), false);
  assert.equal(lines.join('').includes('private-cookie'), false);
});
