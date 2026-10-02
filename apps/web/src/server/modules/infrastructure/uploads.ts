import { randomUUID } from 'node:crypto';
import { writeFile, unlink, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { userId, AppError } from './context.ts';
import { endpoint } from './http.ts';

export const upload = endpoint(
  async (req, ctx) => {
    const form = req.body;
    if (!(form instanceof FormData)) throw new AppError(400, '请选择照片');
    const entries = [...form.entries()];
    const file = form.get('file');
    if (entries.length !== 1 || !(file instanceof File)) throw new AppError(400, '请选择一张照片');
    if (file.size > 5 * 1024 * 1024) throw new AppError(413, '照片不能超过 5 MB');
    const buffer = Buffer.from(await file.arrayBuffer());
    let extension = '';
    if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
      extension = 'png';
    else if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) extension = 'jpg';
    else if (
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    )
      extension = 'webp';
    if (!extension) throw new AppError(400, '仅支持 PNG、JPEG 和 WebP 照片');
    const filename = randomUUID() + '.' + extension;
    const path = '/uploads/' + filename;
    const destination = join(ctx.dataDir, 'uploads', filename);
    await writeFile(destination, buffer, { flag: 'wx' });
    try {
      ctx.db.run('INSERT INTO uploads VALUES(?,?,?)', path, userId(req), new Date().toISOString());
    } catch (error) {
      await unlink(destination);
      throw error;
    }
    return { path };
  },
  { auth: true, status: 201, body: 'form' },
);

export const uploadedFile = endpoint(async (req, ctx) => {
  const filename = req.params.filename;
  if (!/^[a-f0-9-]+\.(png|jpg|webp)$/.test(filename)) throw new AppError(404, '照片不存在');
  let bytes: Buffer;
  try {
    bytes = await readFile(join(ctx.dataDir, 'uploads', filename));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new AppError(404, '照片不存在');
    throw error;
  }
  const mime = filename.endsWith('.jpg')
    ? 'image/jpeg'
    : filename.endsWith('.png')
      ? 'image/png'
      : 'image/webp';
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': mime,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public,max-age=86400',
    },
  });
});
