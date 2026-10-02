import { ZodError } from 'zod';
import { getRuntime } from '../../runtime.ts';
import { authenticate } from '../user/session.ts';
import { AppError } from './context.ts';
import type { Handler, EndpointOptions, RouteParams } from './models.ts';

export function json(body: unknown, status = 200, headers: HeadersInit = {}) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}
export async function readBody(request: Request, max: number) {
  if (Number(request.headers.get('content-length')) > max)
    throw new AppError(413, '请求内容超过大小限制');
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > max) {
        await reader.cancel();
        throw new AppError(413, '请求内容超过大小限制');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
export function endpoint(handler: Handler, options: EndpointOptions = {}) {
  return async (request: Request, route?: RouteParams): Promise<Response> => {
    try {
      const ctx = getRuntime();
      // Set by our Node server from the socket, overriding any incoming value.
      const ip = request.headers.get('x-mayoimon-client-ip') ?? 'local';
      ctx.limit('all:' + ip, 300);
      if (options.rate) ctx.limit(new URL(request.url).pathname + ':' + ip, options.rate);
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
        const origin = request.headers.get('origin');
        if (origin && !ctx.origins.includes(origin)) throw new AppError(403, '不允许的请求来源');
        if (request.headers.get('sec-fetch-site') === 'cross-site')
          throw new AppError(403, '不允许跨站请求');
      }
      const session = authenticate(ctx, request.headers.get('cookie'));
      if (options.auth && !session.user) throw new AppError(401, '请先登录');
      let body: unknown;
      if (request.body) {
        const bytes = await readBody(
          request,
          options.body === 'form' ? 6 * 1024 * 1024 : 1024 * 1024,
        );
        if (options.body === 'form') {
          try {
            body = await new Request(request.url, {
              method: 'POST',
              headers: request.headers,
              body: bytes,
            }).formData();
          } catch {
            throw new AppError(400, '上传格式无效');
          }
        } else if (bytes.length) {
          if (!request.headers.get('content-type')?.includes('application/json'))
            throw new AppError(415, '请使用 JSON 请求');
          try {
            body = JSON.parse(new TextDecoder().decode(bytes));
          } catch {
            throw new AppError(400, 'JSON 格式无效');
          }
        }
      }
      const result = await handler(
        {
          request,
          body,
          query: Object.fromEntries(new URL(request.url).searchParams),
          params: route ? await route.params : {},
          ...session,
        },
        ctx,
      );
      return result instanceof Response ? result : json(result, options.status);
    } catch (error) {
      if (error instanceof ZodError)
        return json(
          { error: { message: error.issues[0]?.message ?? '输入有误', issues: error.issues } },
          400,
        );
      // Runtime errors may come from the unbundled custom server module copy.
      const status =
        error instanceof Error && 'statusCode' in error ? Number(error.statusCode) : 500;
      if (status >= 400 && status < 500)
        return json(
          { error: { message: (error as Error).message } },
          status,
          status === 429 ? { 'Retry-After': '60' } : {},
        );
      console.error(error);
      return json({ error: { message: '服务暂时不可用，请稍后重试' } }, 500);
    }
  };
}
