import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { SocketEvent } from '@mayoimon/shared';
import type { Context } from '../infrastructure/models.ts';
import { authenticate } from '../user/session.ts';

export function attachChatSocket(server: Server, ctx: Context) {
  const hub = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  const sockets = new Map<string, Set<{ socket: WebSocket; hash: string }>>();
  ctx.emit = (user, event) => {
    for (const item of sockets.get(user) ?? []) {
      if (item.socket.readyState === 1) item.socket.send(JSON.stringify(event));
    }
  };
  ctx.disconnect = (hash) => {
    for (const items of sockets.values())
      for (const item of items) if (item.hash === hash) item.socket.close(1008, 'session revoked');
  };
  // Next installs its own listener for development HMR. It leaves /ws alone
  // because that path has no matching Next page, Route Handler or rewrite.
  const handleUpgrade = (
    req: import('node:http').IncomingMessage,
    socket: import('node:stream').Duplex,
    head: Buffer,
  ) => {
    if (req.url?.split('?')[0] !== '/ws') return;
    const session = authenticate(ctx, req.headers.cookie);
    const status = !session.user
      ? 401
      : !req.headers.origin || !ctx.origins.includes(req.headers.origin)
        ? 403
        : 0;
    if (status) {
      socket.end(
        `HTTP/1.1 ${status} ${status === 401 ? 'Unauthorized' : 'Forbidden'}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
      );
      return;
    }
    hub.handleUpgrade(req, socket, head, (client) => {
      const owner = session.user!.id;
      const items = sockets.get(owner) ?? new Set();
      if (items.size >= 5) {
        client.close(1008, 'too many connections');
        return;
      }
      const item = { socket: client, hash: session.sessionHash! };
      items.add(item);
      sockets.set(owner, items);
      client.send(JSON.stringify({ type: 'ready' } satisfies SocketEvent));
      let alive = true;
      client.on('pong', () => {
        alive = true;
      });
      const timer = setInterval(() => {
        if (
          !ctx.db.one(
            'SELECT token_hash FROM sessions WHERE token_hash=? AND expires_at>?',
            item.hash,
            Date.now(),
          )
        ) {
          client.close(1008, 'session expired');
          return;
        }
        if (!alive) {
          client.terminate();
          return;
        }
        alive = false;
        client.ping();
      }, 30000);
      timer.unref();
      client.on('error', () => client.terminate());
      client.on('close', () => {
        clearInterval(timer);
        items.delete(item);
        if (!items.size) sockets.delete(owner);
      });
    });
  };
  server.on('upgrade', handleUpgrade);
  return async () => {
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
