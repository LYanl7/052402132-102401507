import type { LocalMessage } from './models.ts';
import type { ChatMessage, Conversation } from './models.ts';

const databases = new Map<string, Promise<IDBDatabase>>();
let channel: BroadcastChannel | undefined;
function changes() {
  if (!channel && typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel('mayoimon-chat');
    channel.onmessage = (event) =>
      window.dispatchEvent(new CustomEvent('chat-changed', { detail: event.data }));
  }
  return channel;
}
export function notifyChat(user: string) {
  window.dispatchEvent(new CustomEvent('chat-changed', { detail: user }));
  changes()?.postMessage(user);
}
export function subscribeChat(user: string, callback: () => void) {
  changes();
  const listener = (event: Event) => {
    if ((event as CustomEvent).detail === user) callback();
  };
  window.addEventListener('chat-changed', listener);
  return () => window.removeEventListener('chat-changed', listener);
}
export function newDeviceId() {
  // getRandomValues also works on the supported LAN HTTP deployment.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function finished(tx: IDBTransaction) {
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('无法保存本地聊天记录'));
    tx.onerror = () => {}; // Abort reports the error once.
  });
  void done.catch(() => {}); // Request failure may be observed before the transaction abort.
  return done;
}
async function database(user: string) {
  if (!databases.has(user)) {
    const opening = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('mayoimon-chat-' + user, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        const messages = db.createObjectStore('messages', { keyPath: 'id' });
        messages.createIndex('conversation', 'conversationId');
        messages.createIndex('timeline', [
          'conversationId',
          'createdAt',
          'senderId',
          'deviceId',
          'seqId',
          'id',
        ]);
        messages.createIndex('state', 'state');
        messages.createIndex('unread', 'unreadConversation');
        db.createObjectStore('meta', { keyPath: 'key' });
        db.createObjectStore('conversations', { keyPath: 'id' });
      };
      req.onsuccess = () => {
        req.result.onversionchange = () => {
          req.result.close();
          databases.delete(user);
        };
        resolve(req.result);
      };
      req.onerror = () => {
        databases.delete(user);
        reject(new Error('无法打开本地聊天记录，请检查浏览器存储权限'));
      };
      req.onblocked = () => reject(new Error('请关闭其他页面后重试本地聊天存储'));
    });
    databases.set(user, opening);
  }
  return databases.get(user)!;
}
export async function deviceId(user: string) {
  const db = await database(user);
  const tx = db.transaction('meta', 'readwrite'),
    done = finished(tx);
  const store = tx.objectStore('meta');
  const row = await request(store.get('device'));
  const value: string = row?.value ?? newDeviceId();
  if (!row) store.put({ key: 'device', value });
  await done;
  return value;
}
function localId(conversation: string, device: string, seq: number) {
  return `pending:${conversation}:${device}:${seq}`;
}
export async function queueMessage(user: string, conversationId: string, content: string) {
  content = content.trim();
  if (!content || content.length > 2000) throw new Error('消息需为 1–2000 个字符');
  const device = await deviceId(user),
    db = await database(user);
  const tx = db.transaction(['meta', 'messages'], 'readwrite'),
    done = finished(tx);
  const meta = tx.objectStore('meta'),
    key = 'seq:' + conversationId;
  const seqId = ((await request(meta.get(key)))?.value ?? 0) + 1;
  if (!Number.isSafeInteger(seqId)) {
    tx.abort();
    await done;
    throw new Error('设备消息序号已用尽');
  }
  meta.put({ key, value: seqId });
  const now = new Date().toISOString();
  const message: LocalMessage = {
    id: localId(conversationId, device, seqId),
    conversationId,
    senderId: user,
    deviceId: device,
    seqId,
    content,
    createdAt: now,
    queuedAt: now,
    expiresAt: 0,
    state: 'pending',
    read: true,
    unreadConversation: '',
  };
  tx.objectStore('messages').put(message);
  await done;
  notifyChat(user);
  return message;
}
export async function saveMessages(user: string, messages: ChatMessage[]) {
  if (!messages.length) return;
  const db = await database(user),
    tx = db.transaction('messages', 'readwrite'),
    done = finished(tx);
  const store = tx.objectStore('messages');
  for (const message of messages) {
    const old: LocalMessage | undefined = await request(store.get(message.id));
    const pendingKey = localId(message.conversationId, message.deviceId, message.seqId);
    // A peer may have the same device/sequence values; never remove our outbox for it.
    if (message.senderId === user) store.delete(pendingKey);
    const read = old?.read ?? message.senderId === user;
    store.put({
      ...message,
      queuedAt: old?.queuedAt ?? message.createdAt,
      state: 'sent',
      read,
      unreadConversation: read ? '' : message.conversationId,
    } satisfies LocalMessage);
  }
  await done;
  notifyChat(user);
}
export async function missingIds(user: string, ids: string[]) {
  const db = await database(user),
    tx = db.transaction('messages'),
    done = finished(tx);
  const exists = await Promise.all(ids.map((id) => request(tx.objectStore('messages').getKey(id))));
  await done;
  return ids.filter((_, i) => exists[i] === undefined);
}
export async function loadMessages(user: string, conversation: string, limit = 50) {
  const db = await database(user),
    tx = db.transaction('messages'),
    done = finished(tx);
  const store = tx.objectStore('messages');
  const total = request(store.index('conversation').count(conversation));
  const items = await new Promise<LocalMessage[]>((resolve, reject) => {
    const result: LocalMessage[] = [];
    const req = store
      .index('timeline')
      .openCursor(
        IDBKeyRange.bound([conversation, '', ''], [conversation, '\uffff', '\uffff']),
        'prev',
      );
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor || result.length >= limit) {
        resolve(result.reverse());
        return;
      }
      result.push(cursor.value);
      cursor.continue();
    };
  });
  const count = await total;
  await done;
  return { items, total: count };
}
export async function saveConversations(user: string, items: Conversation[]) {
  const db = await database(user),
    tx = db.transaction('conversations', 'readwrite'),
    done = finished(tx);
  for (const item of items)
    tx.objectStore('conversations').put({ ...item, lastMessage: '', unread: 0 });
  await done;
  notifyChat(user);
}
export async function loadConversations(user: string): Promise<Conversation[]> {
  const db = await database(user),
    tx = db.transaction('conversations'),
    done = finished(tx);
  const items: Conversation[] = await request(tx.objectStore('conversations').getAll());
  await done;
  return (
    await Promise.all(
      items.map(async (c) => {
        const latest = (await loadMessages(user, c.id, 1)).items[0];
        const countTx = db.transaction('messages'),
          countDone = finished(countTx);
        const unread = await request(countTx.objectStore('messages').index('unread').count(c.id));
        await countDone;
        return {
          ...c,
          lastMessage: latest?.content ?? '',
          updatedAt: latest?.createdAt ?? c.updatedAt,
          unread,
        };
      }),
    )
  ).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function readLocalMessages(user: string, ids: string[]) {
  if (!ids.length) return;
  const db = await database(user),
    tx = db.transaction('messages', 'readwrite'),
    done = finished(tx);
  const store = tx.objectStore('messages');
  let changed = false;
  for (const id of ids) {
    const row: LocalMessage | undefined = await request(store.get(id));
    if (row && !row.read) {
      store.put({ ...row, read: true, unreadConversation: '' });
      changed = true;
    }
  }
  await done;
  if (changed) notifyChat(user);
}
export async function readAllLocal(user: string) {
  const db = await database(user),
    tx = db.transaction('messages', 'readwrite'),
    done = finished(tx);
  const req = tx.objectStore('messages').openCursor();
  req.onsuccess = () => {
    const c = req.result;
    if (c) {
      if (!c.value.read) c.update({ ...c.value, read: true, unreadConversation: '' });
      c.continue();
    }
  };
  await done;
  notifyChat(user);
}
export async function outbox(user: string): Promise<LocalMessage[]> {
  const db = await database(user),
    tx = db.transaction('messages'),
    done = finished(tx);
  const items: LocalMessage[] = await request(
    tx.objectStore('messages').index('state').getAll('pending'),
  );
  await done;
  return items.sort(
    (a, b) => a.conversationId.localeCompare(b.conversationId) || a.seqId - b.seqId,
  );
}
export async function failMessage(user: string, id: string, failure: string) {
  const db = await database(user),
    tx = db.transaction('messages', 'readwrite'),
    done = finished(tx);
  const store = tx.objectStore('messages'),
    row = await request(store.get(id));
  if (row?.state === 'pending') store.put({ ...row, state: 'failed', failure });
  await done;
  notifyChat(user);
}
// IndexedDB serializes this lease across tabs, including LAN HTTP where Web Locks
// are unavailable. Network requests time out before the lease can expire.
export async function outboxLease(user: string, owner: string, release = false) {
  const db = await database(user),
    tx = db.transaction('meta', 'readwrite'),
    done = finished(tx);
  const store = tx.objectStore('meta'),
    old = await request(store.get('outbox-lease'));
  const allowed = !old || old.owner === owner || old.until <= Date.now();
  if (allowed) store.put({ key: 'outbox-lease', owner, until: release ? 0 : Date.now() + 30000 });
  await done;
  return allowed;
}
