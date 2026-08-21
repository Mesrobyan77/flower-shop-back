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
