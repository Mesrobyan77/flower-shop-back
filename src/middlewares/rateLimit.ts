import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

const disabled = env.NODE_ENV === 'test';

const base = {
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => disabled,
  message: { success: false, message: 'Too many requests, please try again later', code: 'RATE_LIMITED' },
};

/** Generic ceiling for the whole API. */
export const apiLimiter = rateLimit({ ...base, windowMs: 60_000, limit: 300 });

/** Credential endpoints get a much tighter budget. */
export const authLimiter = rateLimit({ ...base, windowMs: 15 * 60_000, limit: 20 });

/** Writes that create public content. */
export const writeLimiter = rateLimit({ ...base, windowMs: 60_000, limit: 40 });

/**
 * Credential budget per account, keyed on the address being signed in to rather
 * than on the caller's IP. The IP-keyed limiters are only as good as the proxy
 * configuration in front of the API; this one holds regardless, so a distributed
 * or header-spoofed password spray still stops at a handful of tries per account.
 */
export const credentialsLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60_000,
  limit: 10,
  keyGenerator: (req) => {
    const email = (req.body as { email?: unknown } | undefined)?.email;
    const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
    return normalized ? `credential:${normalized}` : `credential:ip:${req.ip}`;
  },
});
