import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:http';
import WebSocket from 'ws';
import { eq, count } from 'drizzle-orm';
import { createRuntime, setRuntime, closeRuntime } from '../src/server/runtime.ts';
import { insertUser } from '../src/modules/user/repository.ts';
import { sessionCookie } from '../src/modules/user/session.ts';
import { savePost } from '../src/modules/message/service.ts';
import { sendMessage } from '../src/modules/private-chat/service.ts';
import {
  getOrCreateConversation,
  pendingMessages,
  acknowledge,
  purgeExpiredMessages,
  findConversations,
  markMessagesRead,
} from '../src/modules/private-chat/repository.ts';
import { attachChatSocket } from '../src/modules/private-chat/socket.ts';
import { chatMessages, chatReceipts, chatReads } from '../src/modules/private-chat/schema.ts';
import { invokeRoute } from './route-harness.ts';

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'mayoimon-delivery-test-'));
  const ctx = createRuntime({ dataDir: dir });
  setRuntime(ctx);
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  for (const id of ids)
    insertUser(ctx.db, {
      id,
      email: id + '@example.com',
      name: id,
      passwordHash: 'test',
      createdAt: new Date().toISOString(),
    });
  const [a, b, outsider] = ids;
  const post = savePost(
    ctx.db,
    {
      type: 'lost',
      title: '钥匙',
      category: 'keys',
      location: '图书馆',
      occurredAt: new Date().toISOString(),
      description: '测试',
      contact: '',
      images: [],
      lat: null,
      lng: null,
      status: 'active',
    },
    a,
  );
  const conversation = getOrCreateConversation(ctx.db, {
    id: randomUUID(),
    postId: post.id,
    userA: a,
    userB: b,
    updatedAt: new Date().toISOString(),
  });
  const senderDevice = randomUUID(),
    recipientDevice = randomUUID();
  const input = (seqId: number, content = '消息-' + seqId) => ({
    deviceId: senderDevice,
    seqId,
    content,
    queuedAt: new Date().toISOString(),
  });
  const send = (seqId: number) => sendMessage(ctx.db, conversation.id, a, input(seqId)).message;
  const cookie = (id: string) =>
    sessionCookie(ctx, { id, email: id + '@example.com', name: id, bio: '' }).split(';')[0];
  const close = () => {
    closeRuntime();
    const target = resolve(dir);
    assert.ok(
      target.startsWith(resolve(tmpdir()) + sep) &&
        target.split(sep).at(-1)!.startsWith('mayoimon-delivery-test-'),
    );
    rmSync(target, { recursive: true, force: true });
  };
  return {
    ctx,
    dir,
    a,
    b,
    outsider,
    conversation,
    input,
    send,
    cookie,
    senderDevice,
    recipientDevice,
    close,
  };
}

test('Message identity includes conversation, sender and device; retries cannot resurrect expired messages', () => {
  const f = fixture();
  try {
    const first = f.send(1);
    assert.equal(sendMessage(f.ctx.db, f.conversation.id, f.a, f.input(1)).message.id, first.id);
    assert.throws(
      () => sendMessage(f.ctx.db, f.conversation.id, f.a, f.input(1, 'different')),
      /消息序号已被使用/,
    );
    assert.equal(
      sendMessage(f.ctx.db, f.conversation.id, f.a, { ...f.input(1), deviceId: randomUUID() })
        .created,
      true,
    );
    assert.equal(sendMessage(f.ctx.db, f.conversation.id, f.b, f.input(1)).created, true);
    const secondPost = savePost(
      f.ctx.db,
      {
        type: 'found',
        title: '伞',
        category: 'umbrella',
        location: '食堂',
        occurredAt: new Date().toISOString(),
        description: '黑色',
        contact: '',
        images: [],
        lat: null,
        lng: null,
        status: 'active',
      },
      f.a,
    );
    const second = getOrCreateConversation(f.ctx.db, {
      id: randomUUID(),
      postId: secondPost.id,
      userA: f.a,
      userB: f.b,
      updatedAt: new Date().toISOString(),
    });
    assert.equal(sendMessage(f.ctx.db, second.id, f.a, f.input(1)).created, true);
    f.ctx.db.orm
      .update(chatMessages)
      .set({ expiresAt: Date.now() - 1 })
      .where(eq(chatMessages.id, first.id))
      .run();
    purgeExpiredMessages(f.ctx.db);
    assert.throws(() => sendMessage(f.ctx.db, f.conversation.id, f.a, f.input(1)), /过期/);
    assert.throws(
      () =>
        sendMessage(f.ctx.db, f.conversation.id, f.a, {
          ...f.input(2),
          queuedAt: new Date(Date.now() - 8 * 86400000).toISOString(),
        }),
      /过期/,
    );
  } finally {
    f.close();
  }
});

test('More than fifty offline messages drain through ACK batches; device receipts and reads are independent', async () => {
  const f = fixture();
  try {
    const all = Array.from({ length: 125 }, (_, i) => f.send(i + 1));
    let delivered = 0;
    while (true) {
      const batch = pendingMessages(f.ctx.db, f.b, f.recipientDevice);
      if (!batch.length) break;
      assert.ok(batch.length <= 50);
      acknowledge(
        f.ctx.db,
        f.b,
        f.recipientDevice,
        batch.map((m) => m.id),
      );
      delivered += batch.length;
    }
    assert.equal(delivered, 125);
    assert.equal(pendingMessages(f.ctx.db, f.b, randomUUID()).length, 50);
    assert.equal(findConversations(f.ctx.db, f.b)[0].unread, 125);
    markMessagesRead(f.ctx.db, f.b, [all[0].id], f.conversation.id);
    assert.equal(findConversations(f.ctx.db, f.b)[0].unread, 124);
    const headers = { cookie: f.cookie(f.b) };
    const manifest = await invokeRoute({
      method: 'GET',
      url: `/api/chats/${f.conversation.id}/sync`,
      headers,
    });
    assert.equal(manifest.json().ids.length, 50);
    assert.deepEqual(new Set(manifest.json().ids), new Set(all.slice(-50).map((m) => m.id)));
    const missing = await invokeRoute({
      method: 'POST',
      url: `/api/chats/${f.conversation.id}/sync`,
      headers,
      payload: { ids: [all[100].id, randomUUID()] },
    });
    assert.equal(missing.json().items[0].id, all[100].id);
    assert.equal(missing.json().unavailable.length, 1);
    const denied = await invokeRoute({
      method: 'POST',
      url: `/api/chats/${f.conversation.id}/sync`,
      headers: { cookie: f.cookie(f.outsider) },
      payload: { ids: [all[100].id] },
    });
    assert.equal(denied.statusCode, 404);
    await invokeRoute({
      method: 'POST',
      url: '/api/chats/delivery',
      headers: { cookie: f.cookie(f.outsider) },
      payload: { deviceId: f.recipientDevice, ids: [all[0].id] },
    });
    assert.equal(f.ctx.db.orm.select({ n: count() }).from(chatReceipts).get()!.n, 125);
    const mismatch = await invokeRoute({
      method: 'GET',
      url: '/api/chats',
      headers: { ...headers, 'x-chat-user-id': f.a },
    });
    assert.equal(mismatch.statusCode, 401);
  } finally {
    f.close();
  }
});

test('TTL removes message content and associated receipts; late reads cannot consume a newer message', async () => {
  const f = fixture();
  try {
    const first = f.send(1);
    const next = f.send(2);
    markMessagesRead(f.ctx.db, f.b, [first.id], f.conversation.id);
    assert.equal(findConversations(f.ctx.db, f.b)[0].unread, 1);
    acknowledge(f.ctx.db, f.b, f.recipientDevice, [first.id]);
    f.ctx.db.orm
      .update(chatMessages)
      .set({ expiresAt: Date.now() - 1 })
      .where(eq(chatMessages.id, first.id))
      .run();
    assert.deepEqual(
      pendingMessages(f.ctx.db, f.b, f.recipientDevice).map((m) => m.id),
      [next.id],
    );
    assert.equal(purgeExpiredMessages(f.ctx.db), 1);
    assert.equal(f.ctx.db.orm.select({ n: count() }).from(chatReads).get()!.n, 0);
    assert.equal(f.ctx.db.orm.select({ n: count() }).from(chatReceipts).get()!.n, 0);
    const missing = await invokeRoute({
      method: 'POST',
      url: `/api/chats/${f.conversation.id}/sync`,
      headers: { cookie: f.cookie(f.b) },
      payload: { ids: [first.id] },
    });
    assert.deepEqual(missing.json(), { items: [], unavailable: [first.id] });
  } finally {
    f.close();
  }
});

test('WebSocket retries without ACK, stops after ACK, and replays offline backlog after restart', async () => {
  const f = fixture();
  const server = createServer();
  let closeSockets = attachChatSocket(server, f.ctx);
  const sockets: WebSocket[] = [];
  try {
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const { port } = server.address() as { port: number };
    const cookie = f.cookie(f.b);
    const received: string[] = [];
    const connect = (device: string) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?deviceId=${device}`, {
        headers: { cookie, origin: 'http://localhost:3000' },
      });
      sockets.push(ws);
      ws.on('message', (raw) => {
        const event = JSON.parse(raw.toString());
        if (event.type === 'message') received.push(event.message.id);
      });
      return ws;
    };
    const first = f.send(1);
    const ws = connect(f.recipientDevice);
    const waitFor = async (predicate: () => boolean) => {
      const deadline = Date.now() + 5000;
      while (!predicate()) {
        if (Date.now() > deadline) throw new Error('delivery timed out');
        await new Promise((r) => setTimeout(r, 25));
      }
    };
    await waitFor(() => received.filter((id) => id === first.id).length >= 2);
    ws.send(JSON.stringify({ type: 'ack', ids: [first.id] }));
    await waitFor(() => pendingMessages(f.ctx.db, f.b, f.recipientDevice).length === 0);
    const confirmedCount = received.length;
    await new Promise((r) => setTimeout(r, 2200));
    assert.equal(received.length, confirmedCount);
    await closeSockets();
    const offline = f.send(2);
    closeRuntime();
    const restarted = createRuntime({ dataDir: f.dir });
    setRuntime(restarted);
    closeSockets = attachChatSocket(server, restarted);
    const resumed = connect(f.recipientDevice);
    await waitFor(() => received.includes(offline.id));
    assert.equal(received.filter((id) => id === first.id).length, confirmedCount);
    resumed.send(JSON.stringify({ type: 'ack', ids: [offline.id] }));
    await waitFor(() => pendingMessages(restarted.db, f.b, f.recipientDevice).length === 0);
  } finally {
    for (const ws of sockets) ws.terminate();
    await closeSockets();
    await new Promise<void>((done) => server.close(() => done()));
    f.close();
  }
});
