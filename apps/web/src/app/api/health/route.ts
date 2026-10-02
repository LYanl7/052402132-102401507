import { endpoint } from '@/server/modules/infrastructure/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = endpoint(() => ({ ok: true }));
