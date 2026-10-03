import type { User } from '../user/models.ts';
import type { SocketEvent } from '../private-chat/models.ts';
import type { Database } from './database.ts';

export interface Context {
  db: Database;
  dataDir: string;
  origins: string[];
  secureCookie: boolean;
  chatTtlMs: number;
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

export interface RuntimeOptions {
  databasePath?: string;
  dataDir?: string;
  origins?: string[];
  secureCookie?: boolean;
  chatTtlMs?: number;
}

export type RouteParams = { params: Promise<Record<string, string>> };
export type Handler = (req: RequestContext, ctx: Context) => unknown | Promise<unknown>;
export interface EndpointOptions {
  auth?: boolean;
  status?: number;
  rate?: number;
  body?: 'form';
}
