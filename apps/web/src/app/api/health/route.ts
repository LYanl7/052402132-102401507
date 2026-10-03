import { endpoint } from '@/modules/infrastructure/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = endpoint(() => ({ ok: true }));
