import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import next from 'next';
import nextEnv from '@next/env';
import { getRuntime, closeRuntime } from './src/server/runtime.ts';
import { attachChatSocket } from './src/modules/private-chat/socket.ts';
import { createClientIpResolver } from './src/modules/infrastructure/client-ip.ts';
import { createLogger, withLogContext } from './src/modules/infrastructure/logger.ts';

const log = createLogger('server');

const dev = process.argv.includes('--dev');
const appDir = resolve(dirname(fileURLToPath(import.meta.url)), dev ? '.' : '..');
Object.assign(process.env, { NODE_ENV: dev ? 'development' : 'production' });
nextEnv.loadEnvConfig(appDir, dev);
process.env.DATA_DIR = resolve(appDir, process.env.DATA_DIR ?? '../../data');
const portIndex = process.argv.indexOf('--port');
const port = Number(portIndex >= 0 ? process.argv[portIndex + 1] : (process.env.PORT ?? 3000));
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT must be between 1 and 65535');
const hostname = process.env.HOST ?? '0.0.0.0';
const clientIp = createClientIpResolver(process.env.TRUSTED_PROXIES);
const server = createServer((req, res) => {
  req.headers['x-mayoimon-client-ip'] = clientIp(
    req.socket.remoteAddress,
    req.headers['x-forwarded-for'],
  );
  const requestId = randomUUID();
  res.setHeader('X-Request-Id', requestId);
  void withLogContext({ requestId, method: req.method }, () => handle(req, res)).catch((error) => {
    log.error('server.request_failed', { requestId, method: req.method, error });
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end('Internal server error');
    } else res.destroy();
  });
});
const app = next({ dev, dir: appDir, hostname, port, httpServer: server });
const handle = app.getRequestHandler();
const runtime = getRuntime();
const closeSockets = attachChatSocket(server, runtime);
await app.prepare().catch((error) => {
  log.error('server.prepare_failed', { error });
  throw error;
});
await new Promise<void>((resolve, reject) => {
  server.once('error', reject);
  server.listen(port, hostname, () => {
    server.off('error', reject);
    resolve();
  });
}).catch((error) => {
  log.error('server.listen_failed', { port, hostname, error });
  throw error;
});
log.info('server.started', { mode: dev ? 'development' : 'production', hostname, port });
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  log.info('server.stopping');
  const closed = new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await closeSockets();
  await app.close();
  await closed;
  closeRuntime();
  log.info('server.stopped');
}
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    void shutdown().then(
      () => process.exit(0),
      (error) => {
        log.error('server.shutdown_failed', { error });
        process.exit(1);
      },
    );
  });
