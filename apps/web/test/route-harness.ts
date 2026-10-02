import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

type RouteModule = Record<
  string,
  (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>
>;
const appDir = new URL('../src/app/', import.meta.url);
const routes = readdirSync(fileURLToPath(appDir), { recursive: true })
  .filter((path): path is string => typeof path === 'string' && /(?:^|[\\/])route\.ts$/.test(path))
  .map((path) => {
    const segments = path
      .replaceAll('\\', '/')
      .replace(/\/route\.ts$/, '')
      .split('/');
    const params = segments.filter((part) => part.startsWith('[')).map((part) => part.slice(1, -1));
    return {
      params,
      pattern: new RegExp(
        '^/' + segments.map((part) => (part.startsWith('[') ? '([^/]+)' : part)).join('/') + '$',
      ),
      load: () => import(new URL(path.replaceAll('\\', '/'), appDir).href) as Promise<RouteModule>,
    };
  })
  .sort((a, b) => a.params.length - b.params.length);

// Invoke the real route.ts exports with Web Requests, independent of a dev build.
// Playwright covers Next's HTTP routing and the custom server together.
export async function invokeRoute(options: {
  method: string;
  url: string;
  payload?: unknown;
  headers?: Record<string, string>;
}) {
  const url = new URL(options.url, 'http://localhost:3000');
  const route = routes.find((route) => route.pattern.test(url.pathname));
  if (!route) throw new Error('Missing route: ' + url.pathname);
  const match = url.pathname.match(route.pattern)!;
  const handler = (await route.load())[options.method];
  if (!handler) throw new Error('Missing method: ' + options.method + ' ' + url.pathname);
  const headers = new Headers(options.headers);
  let body: BodyInit | undefined;
  if (options.payload !== undefined) {
    if (Buffer.isBuffer(options.payload)) body = new Uint8Array(options.payload);
    else {
      body = JSON.stringify(options.payload);
      headers.set('Content-Type', 'application/json');
    }
  }
  const response = await handler(new Request(url, { method: options.method, headers, body }), {
    params: Promise.resolve(
      Object.fromEntries(route.params.map((key, i) => [key, decodeURIComponent(match[i + 1])])),
    ),
  });
  const text = response.headers.get('content-type')?.includes('application/json')
    ? await response.text()
    : '';
  return {
    statusCode: response.status,
    headers: Object.fromEntries(response.headers),
    json: () => JSON.parse(text),
  };
}
