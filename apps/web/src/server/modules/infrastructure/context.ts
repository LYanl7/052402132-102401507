import type { RequestContext } from './models.ts';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
export function userId(req: RequestContext): string {
  if (!req.user) throw new AppError(401, '请先登录');
  return req.user.id;
}
