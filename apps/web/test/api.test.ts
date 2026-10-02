import { count, eq } from 'drizzle-orm';
import { posts, schemaMigrations } from '../src/server/modules/infrastructure/schema.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { createServer } from 'node:http';
import { createRuntime, setRuntime, closeRuntime } from '../src/server/runtime.js';
import { attachChatSocket } from '../src/server/modules/private-chat/socket.js';
import { invokeRoute } from './route-harness.js';
import { Database } from '../src/server/modules/infrastructure/database.js';

test('API business flows, permissions, persistent storage and realtime delivery', async (t) => {
  const temp = mkdtempSync(join(tmpdir(), 'mayoimon-api-'));
  const databasePath = join(temp, 'test.sqlite');
  const runtime = createRuntime({ dataDir: temp, databasePath });
  setRuntime(runtime);
  const server = createServer((_req, res) => {
    res.writeHead(404).end();
  });
  const closeSockets = attachChatSocket(server, runtime);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  let closed = false;
  async function close() {
    if (closed) return;
    closed = true;
    await closeSockets();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    closeRuntime();
  }
  const sockets: WebSocket[] = [];
  async function call(method: string, url: string, payload?: unknown, cookie?: string) {
    return invokeRoute({
      method: method as 'GET',
      url,
      payload: payload as object,
      headers: cookie ? { cookie } : {},
    });
  }
  async function register(name: string) {
    const res = await call('POST', '/api/users/register', {
      email: name + '@example.com',
      password: 'password123',
      name,
    });
    assert.equal(res.statusCode, 201);
    return { user: res.json().user, cookie: String(res.headers['set-cookie']).split(';')[0] };
  }
  try {
    const alice = await register('Alice'),
      bob = await register('Bob'),
      eve = await register('Eve');
    const input = {
      type: 'lost',
      title: '银色钥匙串',
      category: 'keys',
      location: '图书馆',
      occurredAt: new Date(Date.now() - 1000).toISOString(),
      description: '蓝色挂件',
      contact: '站内联系',
      images: [],
      lat: 26.0588,
      lng: 119.1968,
      status: 'active',
    };
    const created = await call('POST', '/api/posts', input, alice.cookie);
    assert.equal(created.statusCode, 201);
    const postId = created.json().post.id;
    await t.test('Authentication, validation and profile updates', async () => {
      assert.equal((await call('POST', '/api/posts', input)).statusCode, 401);
      assert.equal(
        (
          await call('POST', '/api/users/login', {
            email: 'alice@example.com',
            password: 'incorrect123',
          })
        ).statusCode,
        401,
      );
      const me = await call('GET', '/api/users/me', undefined, alice.cookie);
      assert.equal(me.json().user.name, 'Alice');
      assert.equal('password_hash' in me.json().user, false);
      assert.equal(
        (
          await call(
            'PATCH',
            '/api/users/me',
            { name: '林同学', bio: '愿每件失物都能回家' },
            alice.cookie,
          )
        ).statusCode,
        200,
      );
      assert.equal(
        (await call('POST', '/api/posts', { ...input, title: '' }, alice.cookie)).statusCode,
        400,
      );
      const crossOrigin = await invokeRoute({
        method: 'POST',
        url: '/api/users/logout',
        headers: { cookie: alice.cookie, origin: 'https://evil.example' },
      });
      assert.equal(crossOrigin.statusCode, 403);
    });
    await t.test('Search, drafts, owner authorization and nearby distance', async () => {
      assert.equal((await call('GET', '/api/posts?q=钥匙&type=lost')).json().total, 1);
      assert.equal((await call('GET', '/api/posts?q=%27%20OR%201%3D1--')).json().total, 0);
      assert.equal(
        (await call('PUT', '/api/posts/' + postId, { ...input, title: '被修改' }, bob.cookie))
          .statusCode,
        403,
      );
      assert.equal(
        (await call('DELETE', '/api/posts/' + postId, undefined, bob.cookie)).statusCode,
        403,
      );
      const draft = await call(
        'POST',
        '/api/posts',
        { ...input, status: 'draft', title: '', location: '', description: '', occurredAt: '' },
        alice.cookie,
      );
      assert.equal(draft.statusCode, 201);
      const draftId = draft.json().post.id;
      assert.equal((await call('GET', '/api/posts/' + draftId)).statusCode, 404);
      assert.equal(
        (await call('GET', '/api/posts/' + draftId, undefined, bob.cookie)).statusCode,
        404,
      );
      assert.equal(
        (await call('GET', '/api/posts/mine?status=draft', undefined, alice.cookie)).json().items
          .length,
        1,
      );
      assert.equal(
        (await call('POST', '/api/posts/' + draftId + '/complete', undefined, alice.cookie))
          .statusCode,
        409,
      );
      assert.equal(
        (
          await call('PUT', '/api/posts/' + draftId, { ...input, title: '发布草稿' }, alice.cookie)
        ).json().post.status,
        'active',
      );
      const nearby = await call('GET', '/api/posts/nearby?lat=26.0588&lng=119.1968&radius=50');
      assert.equal(nearby.json().items[0].distance, 0);
      assert.equal((await call('GET', '/api/posts/nearby?lat=0&lng=0&radius=50')).json().total, 0);
      assert.equal(
        (await call('DELETE', '/api/posts/' + draftId, undefined, alice.cookie)).statusCode,
        200,
      );
      assert.equal(
        (await call('GET', '/api/posts/' + draftId, undefined, alice.cookie)).statusCode,
        404,
      );
    });
    await t.test('Favorites are idempotent; views and personal history are stored', async () => {
      for (let i = 0; i < 2; i++)
        assert.equal(
          (await call('PUT', '/api/interactions/favorites/' + postId, undefined, bob.cookie))
            .statusCode,
          200,
        );
      assert.equal(
        (await call('GET', '/api/interactions/favorites', undefined, bob.cookie)).json().items
          .length,
        1,
      );
      for (let i = 0; i < 2; i++)
        await call('POST', '/api/interactions/posts/' + postId + '/view', undefined, bob.cookie);
      assert.equal(
        (await call('GET', '/api/posts/' + postId, undefined, bob.cookie)).json().post.views,
        2,
      );
      assert.equal(
        (await call('GET', '/api/interactions/history', undefined, bob.cookie)).json().items.length,
        1,
      );
      await call('DELETE', '/api/interactions/history', undefined, bob.cookie);
      assert.equal(
        (await call('GET', '/api/interactions/stats', undefined, bob.cookie)).json().history,
        0,
      );
      await call('DELETE', '/api/interactions/favorites/' + postId, undefined, bob.cookie);
      assert.equal(
        (await call('GET', '/api/interactions/favorites', undefined, bob.cookie)).json().items
          .length,
        0,
      );
    });
    await t.test(
      'Private chat, unread receipts, idempotency, WebSocket push and logout revocation',
      async () => {
        assert.equal((await call('POST', '/api/chats', { postId }, alice.cookie)).statusCode, 400);
        const conversation = (await call('POST', '/api/chats', { postId }, bob.cookie)).json()
          .conversation;
        assert.equal(
          (await call('POST', '/api/chats', { postId }, bob.cookie)).json().conversation.id,
          conversation.id,
        );
        const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`, {
          headers: { cookie: alice.cookie, origin: 'http://localhost:3000' },
        });
        sockets.push(socket);
        await new Promise<void>((resolve, reject) => {
          socket.once('message', (data) => {
            assert.equal(JSON.parse(data.toString()).type, 'ready');
            resolve();
          });
          socket.once('error', reject);
        });
        const pushed = new Promise<{ type: string; message: { content: string } }>(
          (resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('push timed out')), 3000);
            socket.once('message', (data) => {
              clearTimeout(timer);
              resolve(JSON.parse(data.toString()));
            });
          },
        );
        const message = { content: '我看到一串带蓝色挂件的钥匙', clientId: randomUUID() };
        const first = await call(
          'POST',
          '/api/chats/' + conversation.id + '/messages',
          message,
          bob.cookie,
        );
        assert.equal(first.statusCode, 201);
        assert.equal((await pushed).message.content, message.content);
        const second = await call(
          'POST',
          '/api/chats/' + conversation.id + '/messages',
          message,
          bob.cookie,
        );
        assert.equal(second.statusCode, 200);
        assert.equal(second.json().message.id, first.json().message.id);
        assert.equal(
          (await call('GET', '/api/chats', undefined, alice.cookie)).json().items[0].unread,
          1,
        );
        assert.equal(
          (await call('GET', '/api/chats/' + conversation.id + '/messages', undefined, eve.cookie))
            .statusCode,
          404,
        );
        assert.equal(
          (
            await call(
              'POST',
              '/api/chats/' + conversation.id + '/messages',
              { ...message, clientId: randomUUID() },
              eve.cookie,
            )
          ).statusCode,
          404,
        );
        assert.equal(
          (await call('POST', '/api/chats/' + conversation.id + '/read', undefined, eve.cookie))
            .statusCode,
          404,
        );
        await call('POST', '/api/chats/' + conversation.id + '/read', undefined, alice.cookie);
        assert.equal(
          (await call('GET', '/api/chats', undefined, alice.cookie)).json().items[0].unread,
          0,
        );
        await call(
          'POST',
          '/api/chats/' + conversation.id + '/messages',
          { content: '谢谢，我来核对。', clientId: randomUUID() },
          alice.cookie,
        );
        const page = (
          await call(
            'GET',
            '/api/chats/' + conversation.id + '/messages?limit=1',
            undefined,
            bob.cookie,
          )
        ).json();
        assert.equal(page.items.length, 1);
        assert.ok(page.nextCursor);
        const older = (
          await call(
            'GET',
            '/api/chats/' + conversation.id + '/messages?limit=1&before=' + page.nextCursor,
            undefined,
            bob.cookie,
          )
        ).json();
        assert.equal(older.items[0].content, message.content);
        const closed = new Promise<number>((resolve) =>
          socket.once('close', (code) => resolve(code)),
        );
        await call('POST', '/api/users/logout', undefined, alice.cookie);
        assert.equal(await closed, 1008);
        assert.equal(
          (await call('GET', '/api/users/me', undefined, alice.cookie)).json().user,
          null,
        );
      },
    );
    await t.test('Only the owner can complete; completed posts reject new contacts', async () => {
      assert.equal(
        (await call('POST', '/api/posts/' + postId + '/complete', undefined, bob.cookie))
          .statusCode,
        403,
      );
      const login = await call('POST', '/api/users/login', {
        email: 'Alice@example.com',
        password: 'password123',
      });
      assert.equal(login.statusCode, 200);
      const cookie = String(login.headers['set-cookie']).split(';')[0];
      assert.equal(
        (await call('POST', '/api/posts/' + postId + '/complete', undefined, cookie)).json().post
          .status,
        'completed',
      );
      assert.equal((await call('PUT', '/api/posts/' + postId, input, cookie)).statusCode, 409);
      assert.equal((await call('POST', '/api/chats', { postId }, eve.cookie)).statusCode, 409);
      assert.equal(
        (await call('GET', '/api/posts/mine?status=completed', undefined, cookie)).json().items
          .length,
        1,
      );
    });
    await t.test('Upload signature validation and ownership', async () => {
      assert.equal((await call('GET', '/api/posts?status=active')).json().total, 0);
      assert.equal((await call('GET', '/api/posts?status=completed')).json().total, 1);
      function multipartBody(content: Buffer) {
        return Buffer.concat([
          Buffer.from(
            '--boundary\r\nContent-Disposition: form-data; name="file"; filename="photo.png"\r\nContent-Type: image/png\r\n\r\n',
          ),
          content,
          Buffer.from('\r\n--boundary--\r\n'),
        ]);
      }
      const invalid = await invokeRoute({
        method: 'POST',
        url: '/api/uploads',
        headers: { cookie: bob.cookie, 'content-type': 'multipart/form-data; boundary=boundary' },
        payload: multipartBody(Buffer.from('<script>alert(1)</script>')),
      });
      assert.equal(invalid.statusCode, 400);
      const bytes = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=',
        'base64',
      );
      const uploaded = await invokeRoute({
        method: 'POST',
        url: '/api/uploads',
        headers: { cookie: bob.cookie, 'content-type': 'multipart/form-data; boundary=boundary' },
        payload: multipartBody(bytes),
      });
      assert.equal(uploaded.statusCode, 201);
      const path = uploaded.json().path;
      assert.equal((await call('GET', path)).headers['x-content-type-options'], 'nosniff');
      assert.equal(
        (await call('POST', '/api/posts', { ...input, images: [path] }, eve.cookie)).statusCode,
        400,
      );
      assert.equal(
        (await call('POST', '/api/posts', { ...input, images: [path] }, bob.cookie)).statusCode,
        201,
      );
    });
    await t.test('Native HTTP limits and WebSocket handshake authorization', async () => {
      const malformed = await invokeRoute({
        method: 'POST',
        url: '/api/users/login',
        headers: { 'content-type': 'application/json' },
        payload: Buffer.from('{broken'),
      });
      assert.equal(malformed.statusCode, 400);
      const large = await invokeRoute({
        method: 'POST',
        url: '/api/posts',
        headers: { cookie: bob.cookie, 'content-type': 'application/json' },
        payload: Buffer.alloc(1024 * 1024 + 1, 32),
      });
      assert.equal(large.statusCode, 413);
      const photo = await invokeRoute({
        method: 'POST',
        url: '/api/uploads',
        headers: { cookie: bob.cookie, 'content-type': 'multipart/form-data; boundary=boundary' },
        payload: Buffer.concat([
          Buffer.from(
            '--boundary\r\nContent-Disposition: form-data; name="file"; filename="large.png"\r\nContent-Type: image/png\r\n\r\n',
          ),
          Buffer.alloc(5 * 1024 * 1024 + 1),
          Buffer.from('\r\n--boundary--\r\n'),
        ]),
      });
      assert.equal(photo.statusCode, 413);
      assert.equal((await call('GET', '/uploads/unknown.svg')).statusCode, 404);
      for (const [headers, status] of [
        [{ origin: 'http://localhost:3000' }, 401],
        [{ cookie: bob.cookie, origin: 'https://evil.example' }, 403],
      ] as const) {
        const rejected = new WebSocket(`ws://127.0.0.1:${address.port}/ws`, { headers });
        sockets.push(rejected);
        rejected.on('error', () => {});
        const response = await new Promise<number | undefined>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('handshake timed out')), 3000);
          rejected.once('unexpected-response', (_request, response) => {
            clearTimeout(timeout);
            response.resume();
            rejected.terminate();
            resolve(response.statusCode);
          });
          rejected.once('open', () => {
            clearTimeout(timeout);
            reject(new Error('unauthorized socket opened'));
          });
        });
        assert.equal(response, status);
      }
      let limited;
      for (let i = 0; i < 11; i++) limited = await call('POST', '/api/users/register', {});
      assert.equal(limited?.statusCode, 429);
      assert.equal(limited?.headers['retry-after'], '60');
    });
    await close();
    await t.test(
      'SQLite data survives reopening the database and migrations are idempotent',
      () => {
        const reopened = new Database(databasePath);
        try {
          assert.equal(
            reopened.orm
              .select({ status: posts.status })
              .from(posts)
              .where(eq(posts.id, postId))
              .get()?.status,
            'completed',
          );
          assert.equal(
            reopened.orm.select({ count: count() }).from(schemaMigrations).get()?.count,
            1,
          );
        } finally {
          reopened.close();
        }
      },
    );
  } finally {
    for (const socket of sockets) socket.terminate();
    await close();
    const target = resolve(temp);
    if (
      target.startsWith(resolve(tmpdir()) + '\\mayoimon-api-') ||
      target.startsWith(resolve(tmpdir()) + '/mayoimon-api-')
    )
      rmSync(target, { recursive: true, force: true });
  }
});
