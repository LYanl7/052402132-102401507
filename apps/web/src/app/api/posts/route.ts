export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export { listPosts as GET } from '@/server/modules/message/handlers';
export { createPost as POST } from '@/server/modules/message/handlers';
