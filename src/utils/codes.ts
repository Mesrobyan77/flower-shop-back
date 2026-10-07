import crypto from 'crypto';
import { toDateKey } from './dateKey';

const ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function randomChars(n: number): string {
  const bytes = crypto.randomBytes(n);
  let out = '';
  for (let i = 0; i < n; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** Human-quotable order number: XF-20260821-9K4T2 (dated on the shop calendar) */
export function generateOrderCode(date = new Date()): string {
  return `XF-${toDateKey(date).replace(/-/g, '')}-${randomChars(5)}`;
}

/** Internal product SKU: XF-A1B2C3 */
export function generateSku(): string {
  return `XF-${randomChars(6)}`;
}

/** Stable SKU derived from the seed slug, so repeated seeds keep the same code. */
export function skuFromSlug(slug: string): string {
  const digest = crypto.createHash('sha1').update(slug).digest('hex').toUpperCase();
  return `XF-${digest.slice(0, 6)}`;
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}
