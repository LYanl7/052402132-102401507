import type { ChatMessage, Conversation, SocketEvent } from '@mayoimon/shared';
import { api, ApiError, errorMessage } from './api';
import {
  deviceId,
  saveMessages,
  missingIds,
  saveConversations,
  outbox,
  failMessage,
  outboxLease,
  newDeviceId,
  subscribeChat,
} from './chat-store';

export function chatApi<T>(user: string, path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  headers.set('x-chat-user-id', user);
  return api<T>(path, {
    ...options,
    headers,
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(10000)])
      : AbortSignal.timeout(10000),
  });
}
export async function refreshConversations(user: string, signal?: AbortSignal) {
  const { items } = await chatApi<{ items: Conversation[] }>(user, '/chats', { signal });
  if (signal?.aborted) return [];
  await saveConversations(user, items);
  return items;
}
export async function reconcileConversation(
  user: string,
  conversation: string,
  signal?: AbortSignal,
) {
  const { ids } = await chatApi<{ ids: string[] }>(user, `/chats/${conversation}/sync`, { signal });
  const missing = await missingIds(user, ids);
  if (!missing.length || signal?.aborted) return;
  const { items } = await chatApi<{ items: ChatMessage[]; unavailable: string[] }>(
    user,
    `/chats/${conversation}/sync`,
    {
      method: 'POST',
      body: JSON.stringify({ ids: missing }),
      signal,
    },
  );
  if (signal?.aborted) return;
  await saveMessages(user, items);
  await chatApi(user, '/chats/delivery', {
    method: 'POST',
    body: JSON.stringify({ deviceId: await deviceId(user), ids: items.map((m) => m.id) }),
    signal,
  });
}
export function startChatSync(
  user: string,
  events: {
    message: (message: ChatMessage) => void;
    connected: (connected: boolean) => void;
    error: (message: string) => void;
    unauthorized: () => void;
  },
) {
  const abort = new AbortController(),
    signal = abort.signal;
  const owner = newDeviceId();
  let socket: WebSocket | undefined,
    device = '',
    disposed = false,
    attempt = 0;
  let reconnect: ReturnType<typeof setTimeout> | undefined;
  let flushing = false,
    syncing = false,
    receiving = false,
    lastFullSync = 0,
    lastError = '';
  let received: ChatMessage[] = [];
  let receiveTimer: ReturnType<typeof setTimeout> | undefined;
  const report = (error: unknown) => {
    if (disposed) return;
    if (error instanceof ApiError && error.status === 401) {
      events.unauthorized();
      return;
    }
    const message = errorMessage(error);
    if (message !== lastError) {
      lastError = message;
      events.error(message);
    }
  };
  async function flush() {
    if (flushing || disposed || !device) return;
    flushing = true;
    try {
      if (!(await outboxLease(user, owner))) return;
      for (const message of (await outbox(user)).slice(0, 50)) {
        if (disposed || !(await outboxLease(user, owner))) break;
        try {
          const result = await chatApi<{ message: ChatMessage }>(
            user,
            `/chats/${message.conversationId}/messages`,
            {
              method: 'POST',
              body: JSON.stringify({
                deviceId: message.deviceId,
                seqId: message.seqId,
                content: message.content,
                queuedAt: message.queuedAt,
              }),
              signal,
            },
          );
          await saveMessages(user, [result.message]);
          if (!disposed) events.message(result.message);
        } catch (error) {
          if (error instanceof ApiError && [400, 403, 404, 409, 410].includes(error.status)) {
            await failMessage(user, message.id, error.message);
          } else {
            if (!disposed) report(error);
            break;
          }
        }
      }
    } catch (error) {
      report(error);
    } finally {
      try {
        await outboxLease(user, owner, true);
      } catch (error) {
        report(error);
      }
      flushing = false;
    }
  }
  async function sync(full = false) {
    if (syncing || disposed || !device) return;
    syncing = true;
    try {
      // Each ACK advances the pending set. Fifty is a batch size, not a backlog limit.
      for (let batch = 0; batch < 20 && !disposed; batch++) {
        const { items } = await chatApi<{ items: ChatMessage[] }>(
          user,
          `/chats/delivery?deviceId=${device}`,
          { signal },
        );
        if (disposed) return;
        await saveMessages(user, items);
        if (items.length) {
          await chatApi(user, '/chats/delivery', {
            method: 'POST',
            body: JSON.stringify({ deviceId: device, ids: items.map((m) => m.id) }),
            signal,
          });
          if (!disposed) events.message(items.at(-1)!);
        }
        if (items.length < 50) break;
      }
      const conversations = await refreshConversations(user, signal);
      if (full) {
        for (const conversation of conversations) {
          if (disposed) break;
          await reconcileConversation(user, conversation.id, signal);
        }
        lastFullSync = Date.now();
      }
      lastError = '';
    } catch (error) {
      report(error);
    } finally {
      syncing = false;
    }
  }
  async function receive() {
    if (receiving || disposed) return;
    receiving = true;
    try {
      while (received.length && !disposed) {
        const batch = received.splice(0, 50);
        await saveMessages(user, batch); // Commit locally before acknowledging delivery.
        if (!disposed && socket?.readyState === WebSocket.OPEN)
          socket.send(JSON.stringify({ type: 'ack', ids: batch.map((m) => m.id) }));
        if (!disposed) events.message(batch.at(-1)!);
      }
      if (!disposed) await refreshConversations(user, signal);
    } catch (error) {
      report(error);
    } finally {
      // No ACK on storage failure: the server retries.
      receiving = false;
    }
  }
  const connect = () => {
    if (disposed) return;
    const url = new URL(
      process.env.NEXT_PUBLIC_WS_URL ??
        `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`,
    );
    url.searchParams.set('deviceId', device);
    const current = new WebSocket(url);
    socket = current;
    current.onmessage = (event) => {
      if (disposed) return;
      try {
        const value = JSON.parse(event.data) as SocketEvent;
        if (value.type === 'ready') {
          attempt = 0;
          events.connected(true);
          void sync(true);
          void flush();
        }
        if (value.type === 'message') {
          received.push(value.message);
          clearTimeout(receiveTimer);
          receiveTimer = setTimeout(() => void receive(), 20);
        }
      } catch (error) {
        report(error);
      }
    };
    current.onclose = (event) => {
      if (disposed) return;
      events.connected(false);
      if (event.code === 1008) events.unauthorized();
      reconnect = setTimeout(connect, Math.min(30000, 1000 * 2 ** Math.min(attempt++, 5)));
    };
    current.onerror = () => current.close();
  };
  const wake = () => {
    if (!disposed) {
      void flush();
      if (socket?.readyState !== WebSocket.OPEN) void sync();
    }
  };
  const unsubscribe = subscribeChat(user, () => void flush());
  const timer = setInterval(() => {
    wake();
    if (Date.now() - lastFullSync >= 60000) void sync(true);
  }, 5000);
  window.addEventListener('online', wake);
  const focus = () => {
    if (document.visibilityState === 'visible') {
      wake();
      void sync(true);
    }
  };
  document.addEventListener('visibilitychange', focus);
  void deviceId(user)
    .then((id) => {
      if (disposed) return;
      device = id;
      connect();
      void sync(true);
      void flush();
    })
    .catch(report);
  return () => {
    disposed = true;
    abort.abort();
    socket?.close();
    events.connected(false);
    clearInterval(timer);
    clearTimeout(reconnect);
    clearTimeout(receiveTimer);
    unsubscribe();
    window.removeEventListener('online', wake);
    document.removeEventListener('visibilitychange', focus);
  };
}
