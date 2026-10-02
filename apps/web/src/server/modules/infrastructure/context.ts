import type { User, SocketEvent } from '@mayoimon/shared';
import type { Database } from './database.ts';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
export interface Context {
  db: Database;
  dataDir: string;
  origins: string[];
  secureCookie: boolean;
  emit: (userId: string, event: SocketEvent) => void;
  disconnect: (tokenHash: string) => void;
  limit: (key: string, max: number) => void;
}
export interface RequestContext {
  request: Request;
  body: unknown;
  query: Record<string, string>;
  params: Record<string, string>;
  user: User | null;
  sessionHash: string | null;
}
export function userId(req: RequestContext): string {
  if (!req.user) throw new AppError(401, '请先登录');
  return req.user.id;
}
