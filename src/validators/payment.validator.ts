import { z } from 'zod';
import { LOCALES } from '../constants';

/**
 * The return token is the credential for an online payment: it reaches the
 * buyer through the checkout response and the return URL, and is the only
 * handle needed to start or inspect that payment.
 */
const token = z.string().min(16).max(128);

export const paymentStartSchema = z.object({
  token,
  locale: z.enum(LOCALES).optional(),
});

export const paymentStatusQuery = z.object({
  token,
  locale: z.enum(LOCALES).optional(),
});
