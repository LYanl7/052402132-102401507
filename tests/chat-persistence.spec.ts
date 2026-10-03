import { test, expect, type Browser, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

async function setup(browser: Browser, page: Page) {
  const owner = await browser.newContext({ baseURL: 'http://127.0.0.1:3001' });
  for (const [request, name] of [
    [owner.request, '发布者'],
    [page.request, '接收者'],
  ] as const) {
    const result = await request.post('/api/users/register', {
      data: { email: randomUUID() + '@example.com', name, password: 'testpassword123' },
    });
    expect(result.status()).toBe(201);
  }
  const user = (await (await page.request.get('/api/users/me')).json()).user;
  const post = await owner.request.post('/api/posts', {
    data: {
      type: 'lost',
      title: '可靠消息测试',
      category: 'keys',
      location: '图书馆',
      occurredAt: new Date(Date.now() - 1000).toISOString(),
      description: '测试',
    },
  });
  const result = await page.request.post('/api/chats', {
    data: { postId: (await post.json()).post.id },
  });
  expect(result.status()).toBe(201);
  return { owner, user, conversation: (await result.json()).conversation };
}
async function localRows(page: Page, user: string) {
  return page.evaluate(
    async (user) =>
      new Promise<any[]>((resolve, reject) => {
        const opening = indexedDB.open('mayoimon-chat-' + user);
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const db = opening.result,
            tx = db.transaction('messages');
          const get = tx.objectStore('messages').getAll();
          get.onsuccess = () => resolve(get.result);
          get.onerror = () => reject(get.error);
          tx.oncomplete = () => db.close();
        };
      }),
    user,
  );
}

test('Persist before ACK, recover more than fifty messages, reconcile holes and retain local history', async ({
  browser,
  page,
}) => {
  test.setTimeout(120000);
  const f = await setup(browser, page),
    device = randomUUID();
  const pushed: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const sent = [];
    for (let seqId = 1; seqId <= 55; seqId++) {
      const response = await f.owner.request.post(`/api/chats/${f.conversation.id}/messages`, {
        data: {
          deviceId: device,
          seqId,
          queuedAt: new Date().toISOString(),
          content: '离线消息-' + seqId,
        },
      });
      expect(response.status()).toBe(201);
      sent.push((await response.json()).message);
    }
    await page.addInitScript(() => {
      (window as any).__failChatWrites = true;
      const original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (value: any, ...args: any[]) {
        if (
          this.name === 'messages' &&
          value.content === '离线消息-1' &&
          (window as any).__failChatWrites
        ) {
          this.transaction.abort();
          throw new DOMException('Simulated storage failure', 'QuotaExceededError');
        }
        return original.call(this, value, ...args);
      };
    });
    page.on('websocket', (socket) => {
      if (new URL(socket.url()).pathname !== '/ws') return;
      socket.on('framereceived', ({ payload }) => {
        const event = JSON.parse(payload.toString());
        if (event.type === 'message') pushed.push(event.message.id);
      });
    });
    await page.goto('/messages/' + f.conversation.id);
    await expect
      .poll(() => pushed.filter((id) => id === sent[0].id).length)
      .toBeGreaterThanOrEqual(2);
    expect((await localRows(page, f.user.id)).some((m) => m.id === sent[0].id)).toBe(false);
    await page.evaluate(() => {
      (window as any).__failChatWrites = false;
    });
    await expect
      .poll(async () => (await localRows(page, f.user.id)).length, { timeout: 20000 })
      .toBe(55);
    await page.getByRole('button', { name: '加载更早的消息' }).click();
    await expect(page.getByText('离线消息-1', { exact: true })).toBeVisible();
    const next = await f.owner.request.post(`/api/chats/${f.conversation.id}/messages`, {
      data: {
        deviceId: device,
        seqId: 56,
        queuedAt: new Date().toISOString(),
        content: '新消息-56',
      },
    });
    expect(next.status()).toBe(201);
    await expect(page.getByText('新消息-56', { exact: true })).toBeVisible();
    await expect(page.getByText('离线消息-6', { exact: true })).toBeVisible();
    // A locally missing but already acknowledged message is repaired by recent-50 reconciliation.
    await page.evaluate(
      async ({ user, id }) =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('mayoimon-chat-' + user);
          open.onsuccess = () => {
            const db = open.result,
              tx = db.transaction('messages', 'readwrite');
            tx.objectStore('messages').delete(id);
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onabort = () => reject(tx.error);
          };
        }),
      { user: f.user.id, id: sent[40].id },
    );
    await page.reload();
    await page.evaluate(() => {
      (window as any).__failChatWrites = false;
    });
    await expect
      .poll(async () => (await localRows(page, f.user.id)).some((m) => m.id === sent[40].id))
      .toBe(true);
    // Expired/absent server history must never replace the local transcript.
    await page.route('**/api/chats/delivery*', (route) =>
      route.fulfill({
        json: route.request().method() === 'GET' ? { items: [], ttlMs: 604800000 } : { ok: true },
      }),
    );
    await page.route('**/api/chats/*/sync', (route) =>
      route.fulfill({ json: { ids: [], ttlMs: 604800000 } }),
    );
    await page.reload();
    await expect(page.getByText('离线消息-41', { exact: true })).toBeVisible();
    await expect.poll(async () => (await localRows(page, f.user.id)).length).toBe(56);
    // Equal timestamps still follow a sender device's numeric sequence order.
    await page.evaluate(
      async (user) =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('mayoimon-chat-' + user);
          open.onsuccess = () => {
            const db = open.result,
              tx = db.transaction('messages', 'readwrite');
            const request = tx.objectStore('messages').openCursor();
            request.onsuccess = () => {
              const row = request.result;
              if (row) {
                row.update({ ...row.value, createdAt: '2026-10-01T00:00:00.000Z' });
                row.continue();
              }
            };
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onabort = () => reject(tx.error);
          };
        }),
      f.user.id,
    );
    await page.reload();
    await page.getByRole('button', { name: '加载更早的消息' }).click();
    await expect
      .poll(() => page.locator('.chat-message p').allTextContents())
      .toEqual([...Array.from({ length: 55 }, (_, i) => '离线消息-' + (i + 1)), '新消息-56']);
    expect(errors).toEqual([]);
  } finally {
    await f.owner.close();
  }
});

test('Outbox survives reload and tabs allocate distinct conversation sequence numbers', async ({
  browser,
  page,
}) => {
  test.setTimeout(90000);
  const f = await setup(browser, page);
  let block = true;
  let accepted = false;
  const submissions: any[] = [];
  await page.context().routeWebSocket(
    (url) => url.pathname === '/ws',
    (ws) => ws.close(),
  );
  await page.context().route('**/api/chats/delivery*', async (route) => {
    if (block) await route.fulfill({ json: { items: [], ttlMs: 604800000 } });
    else await route.continue();
  });
  await page.context().route('**/api/chats/*/sync', async (route) => {
    if (block) await route.fulfill({ json: { ids: [], ttlMs: 604800000 } });
    else await route.continue();
  });
  await page.context().route(`**/api/chats/${f.conversation.id}/messages`, async (route) => {
    if (route.request().method() === 'POST') {
      submissions.push(route.request().postDataJSON());
      if (block) {
        if (!accepted) {
          const response = await route.fetch();
          expect(response.status()).toBe(201);
          accepted = true; // Server committed, but its response never reaches the page.
        }
        await route.abort();
        return;
      }
    }
    await route.continue();
  });
  try {
    await page.goto('/messages/' + f.conversation.id);
    await page.getByRole('textbox', { name: '发送消息' }).fill('刷新后仍要发送');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect
      .poll(
        async () => (await localRows(page, f.user.id)).filter((m) => m.state === 'pending').length,
      )
      .toBe(1);
    await expect.poll(() => submissions.length).toBeGreaterThan(0);
    await expect.poll(() => accepted).toBe(true);
    const first = submissions[0];
    await page.reload();
    await expect(page.getByText('刷新后仍要发送', { exact: true })).toBeVisible();
    block = false;
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect
      .poll(
        async () => (await localRows(page, f.user.id)).filter((m) => m.state === 'pending').length,
        { timeout: 40000 },
      )
      .toBe(0);
    expect(submissions.every((m) => m.seqId === first.seqId && m.deviceId === first.deviceId)).toBe(
      true,
    );
    const other = await page.context().newPage();
    await other.goto('/messages/' + f.conversation.id);
    await page.getByRole('textbox', { name: '发送消息' }).fill('标签页一');
    await other.getByRole('textbox', { name: '发送消息' }).fill('标签页二');
    await Promise.all([
      page.getByRole('button', { name: '发送', exact: true }).click(),
      other.getByRole('button', { name: '发送', exact: true }).click(),
    ]);
    await expect
      .poll(async () => (await localRows(page, f.user.id)).filter((m) => m.state === 'sent').length)
      .toBe(3);
    const rows = await localRows(page, f.user.id);
    expect(rows.map((m) => m.seqId).sort()).toEqual([1, 2, 3]);
    expect(new Set(rows.map((m) => m.deviceId)).size).toBe(1);
    const serverHistory = await f.owner.request.get(`/api/chats/${f.conversation.id}/messages`);
    expect((await serverHistory.json()).items).toHaveLength(3);
    await page.request.post('/api/users/logout');
    const ownerUser = (await (await f.owner.request.get('/api/users/me')).json()).user;
    const login = await page.request.post('/api/users/login', {
      data: { email: ownerUser.email, password: 'testpassword123' },
    });
    expect(login.status()).toBe(200);
    await page.goto('/messages');
    await expect(page.getByText('刷新后仍要发送', { exact: true })).toHaveCount(0);
    await other.close();
  } finally {
    await f.owner.close();
  }
});
