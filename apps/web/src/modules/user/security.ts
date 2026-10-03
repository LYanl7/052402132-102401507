import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = (await derive(password, salt, 64)) as Buffer;
  return salt + ':' + key.toString('hex');
}
export async function checkPassword(password: string, hash: string) {
  const [salt, stored] = hash.split(':');
  const key = (await derive(password, salt, 64)) as Buffer;
  const expected = Buffer.from(stored, 'hex');
  return key.length === expected.length && timingSafeEqual(key, expected);
}
export function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
