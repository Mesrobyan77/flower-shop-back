import crypto from 'crypto';

const ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function randomChars(n: number): string {
  const bytes = crypto.randomBytes(n);
  let out = '';
  for (let i = 0; i < n; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** Human-quotable order number: XF-20260821-9K4T2 */
export function generateOrderCode(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `XF-${y}${m}${d}-${randomChars(5)}`;
}

/** Internal product SKU: XF-A1B2C3 */
export function generateSku(): string {
  return `XF-${randomChars(6)}`;
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}
