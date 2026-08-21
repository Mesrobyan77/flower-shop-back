import { z } from 'zod';
import { phone } from './common.validator';

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password is too long')
  .regex(/[a-zA-Z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a digit');

export const registerSchema = z.object({
  email: z.string().email('Enter a valid email address').max(160),
  password,
  name: z.string().min(2, 'Name is too short').max(80),
  phone: phone.optional(),
  marketingOptIn: z.boolean().optional().default(false),
  agreeTerms: z.literal(true, { errorMap: () => ({ message: 'You must accept the terms' }) }),
});

export const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
  remember: z.boolean().optional().default(false),
});

export const refreshSchema = z.object({ refreshToken: z.string().min(10).optional() });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: password,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const updateProfileSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  phone: phone.optional(),
  marketingOptIn: z.boolean().optional(),
});
