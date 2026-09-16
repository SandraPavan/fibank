import { randomBytes, scrypt as derive, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(derive);
export function validateRegistration(
  displayName: unknown,
  password: unknown,
): string {
  if (
    typeof displayName !== 'string' ||
    !displayName.trim() ||
    displayName.trim().length > 80 ||
    typeof password !== 'string' ||
    !/^\d{6}$/.test(password)
  ) {
    throw new Error('Dados de cadastro inválidos.');
  }
  return displayName.trim();
}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${hash.toString('hex')}`;
}
export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  if (!/^\d{6}$/.test(password)) return false;
  const [algorithm, salt, hash, extra] = encoded.split('$');
  if (
    algorithm !== 'scrypt' ||
    !salt ||
    !/^[a-f0-9]{32}$/.test(salt) ||
    !hash ||
    !/^[a-f0-9]{128}$/.test(hash) ||
    extra !== undefined
  )
    return false;
  return timingSafeEqual(
    (await scrypt(password, salt, 64)) as Buffer,
    Buffer.from(hash, 'hex'),
  );
}
