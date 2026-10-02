import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError } from '../src/lib/api.ts';

test('JSON success responses preserve the returned data', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ favorite: false }));
  assert.deepEqual(await api('/interactions/favorites/example'), { favorite: false });
});

test('Invalid or empty success responses reject instead of returning empty data', async (t) => {
  for (const body of ['<html>unexpected page</html>', '']) {
    t.mock.method(globalThis, 'fetch', async () => new Response(body, { status: 200 }));
    await assert.rejects(api('/posts'), SyntaxError);
    t.mock.restoreAll();
  }
});

test('JSON error responses retain their status and message', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ error: { message: '请先登录' } }, { status: 401 }),
  );
  await assert.rejects(
    api('/posts/mine'),
    (error) => error instanceof ApiError && error.status === 401 && error.message === '请先登录',
  );
});

test('Unreadable error responses still report the HTTP failure', async (t) => {
  for (const body of ['<html>server error</html>', '', 'null']) {
    t.mock.method(globalThis, 'fetch', async () => new Response(body, { status: 503 }));
    await assert.rejects(
      api('/posts'),
      (error) =>
        error instanceof ApiError &&
        error.status === 503 &&
        error.message === '请求失败，请稍后重试',
    );
    t.mock.restoreAll();
  }
});
