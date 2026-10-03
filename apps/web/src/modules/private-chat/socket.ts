import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { z } from 'zod';
import type { Context } from '../infrastructure/models.ts';
import { hasValidSession } from '../user/repository.ts';
import { authenticate } from '../user/session.ts';
import { acknowledge, pendingMessages, purgeExpiredMessages } from './repository.ts';
import { deviceSchema, messageIdsSchema } from './schemas.ts';
import { AppError } from '../infrastructure/context.ts';
import { createLogger, type Logger } from '../infrastructure/logger.ts';

const log = createLogger('private-chat.socket');

export function attachChatSocket(server: Server, ctx: Context) {
  const hub = new WebSocketServer({ noServer: true, maxPayload: 8192 });
  type Connection = {
    socket: WebSocket;
    hash: string;
    deviceId: string;
    retries: Map<string, { attempt: number; at: number }>;
    log: Logger;
  };
  const sockets = new Map<string, Set<Connection>>();
  const deliver = (user: string, item: Connection) => {
    try {
      if (item.socket.readyState !== 1) return;
      if (!hasValidSession(ctx.db, item.hash, Date.now())) {
        item.log.warn('socket.session_expired');
        item.socket.close(1008, 'session expired');
        return;
      }
      const messages = pendingMessages(ctx.db, user, item.deviceId);
      const ids = new Set(messages.map((m) => m.id));
      for (const id of item.retries.keys()) if (!ids.has(id)) item.retries.delete(id);
      for (const message of messages) {
        const previous = item.retries.get(message.id);
        if (previous && previous.at > Date.now()) continue;
        if (item.socket.bufferedAmount > 1024 * 1024) {
          item.log.warn('socket.slow_consumer', { bufferedBytes: item.socket.bufferedAmount });
          item.socket.close(1013, 'slow consumer');
          return;
        }
        item.socket.send(JSON.stringify({ type: 'message', message }));
        const attempt = (previous?.attempt ?? 0) + 1;
        item.log.debug(previous ? 'socket.delivery_retried' : 'socket.message_delivered', {
          messageId: message.id,
          attempt,
        });
        item.retries.set(message.id, {
          attempt,
          at: Date.now() + Math.min(30000, 1000 * 2 ** Math.min(attempt - 1, 5)),
        });
      }
    } catch (error) {
      item.log.error('socket.delivery_failed', { error });
      item.socket.close(1011, 'delivery failed');
    }
  };
  ctx.emit = (user) => {
    for (const item of sockets.get(user) ?? []) deliver(user, item);
  };
  ctx.disconnect = (hash) => {
    for (const items of sockets.values())
      for (const item of items) if (item.hash === hash) item.socket.close(1008, 'session revoked');
  };
  const purge = () => {
    try {
      const count = purgeExpiredMessages(ctx.db);
      if (count) log.info('chat.expired_messages_purged', { count });
    } catch (error) {
      log.error('chat.purge_failed', { error });
    }
  };
  purge();
  const cleanup = setInterval(purge, 60000);
  cleanup.unref();
  const ackInput = messageIdsSchema.extend({ type: z.literal('ack') });
  const handleUpgrade = (
    req: import('node:http').IncomingMessage,
    socket: import('node:stream').Duplex,
    head: Buffer,
  ) => {
    if (req.url?.split('?')[0] !== '/ws') return;
    const session = authenticate(ctx, req.headers.cookie);
    const device = deviceSchema.safeParse(
      Object.fromEntries(new URL(req.url!, 'http://localhost').searchParams),
    );
    const status = !session.user
      ? 401
      : !req.headers.origin || !ctx.origins.includes(req.headers.origin)
        ? 403
        : !device.success
          ? 400
          : 0;
    if (status) {
      log.warn('socket.upgrade_rejected', { status });
      socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
      return;
    }
    hub.handleUpgrade(req, socket, head, (client) => {
      const owner = session.user!.id;
      const items = sockets.get(owner) ?? new Set<Connection>();
      if (items.size >= 5) {
        log.warn('socket.connection_limit', { userId: owner });
        client.close(1008, 'too many connections');
        return;
      }
      const item: Connection = {
        socket: client,
        hash: session.sessionHash!,
        deviceId: device.data!.deviceId,
        retries: new Map(),
        log: log.child({ connectionId: randomUUID(), userId: owner }),
      };
      items.add(item);
      sockets.set(owner, items);
      item.log.info('socket.connected', { connections: items.size });
      client.send(JSON.stringify({ type: 'ready', ttlMs: ctx.chatTtlMs }));
      deliver(owner, item);
      const retry = setInterval(() => deliver(owner, item), 1000);
      retry.unref();
      client.on('message', (data) => {
        if (!hasValidSession(ctx.db, item.hash, Date.now())) {
          client.close(1008, 'session expired');
          return;
        }
        try {
          const ack = ackInput.parse(JSON.parse(data.toString()));
          ctx.limit('chat-ack:' + owner, 1200);
          acknowledge(ctx.db, owner, item.deviceId, ack.ids);
          item.log.debug('socket.acknowledged', { count: ack.ids.length });
          for (const id of ack.ids) item.retries.delete(id);
          deliver(owner, item);
        } catch (error) {
          if (
            error instanceof z.ZodError ||
            error instanceof SyntaxError ||
            error instanceof AppError
          )
            item.log.warn('socket.ack_rejected');
          else item.log.error('socket.ack_failed', { error });
          client.close(1008, 'invalid acknowledgement');
        }
      });
      let alive = true;
      client.on('pong', () => {
        alive = true;
      });
      const heartbeat = setInterval(() => {
        if (!alive) {
          item.log.warn('socket.heartbeat_timeout');
          client.terminate();
          return;
        }
        alive = false;
        client.ping();
      }, 30000);
      heartbeat.unref();
      client.on('error', (error) => {
        item.log.error('socket.failed', { error });
        client.terminate();
      });
      client.on('close', (code) => {
        clearInterval(retry);
        clearInterval(heartbeat);
        items.delete(item);
        if (!items.size) sockets.delete(owner);
        item.log.info('socket.disconnected', { code, connections: items.size });
      });
    });
  };
  server.on('upgrade', handleUpgrade);
  return async () => {
    clearInterval(cleanup);
    server.off('upgrade', handleUpgrade);
    ctx.emit = () => {};
    ctx.disconnect = () => {};
    for (const client of hub.clients) client.close(1001, 'server stopping');
    const timer = setTimeout(() => {
      for (const client of hub.clients) client.terminate();
    }, 1000);
    await new Promise<void>((resolve, reject) =>
      hub.close((error) => (error ? reject(error) : resolve())),
    );
    clearTimeout(timer);
  };
}
