import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import next from 'next';
import nextEnv from '@next/env';
import { getRuntime, closeRuntime } from './src/server/runtime.ts';
import { attachChatSocket } from './src/server/modules/private-chat/socket.ts';

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
const server = createServer((req, res) => {
  req.headers['x-mayoimon-client-ip'] = req.socket.remoteAddress ?? 'local';
  void handle(req, res).catch((error) => {
    console.error(error);
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
await app.prepare();
await new Promise<void>((resolve, reject) => {
  server.once('error', reject);
  server.listen(port, hostname, () => {
    server.off('error', reject);
    resolve();
  });
});
console.log(
  `Mayoimon ${dev ? 'development' : 'production'}: http://localhost:${port} (pages, API, uploads and WebSocket)`,
);
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  const closed = new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await closeSockets();
  await app.close();
  await closed;
  closeRuntime();
}
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    void shutdown().then(
      () => process.exit(0),
      (error) => {
        console.error(error);
        process.exit(1);
      },
    );
  });
