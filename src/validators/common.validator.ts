import { z } from 'zod';
import { LOCALES } from '../constants';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const idParam = z.object({ id: objectId });
export const slugParam = z.object({ slug: z.string().min(1).max(120) });

export const localeQuery = z.object({ locale: z.enum(LOCALES).optional() });

export const pagingQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(60).optional(),
});

export const localizedInput = z.object({
  hy: z.string().min(1, 'Armenian text is required'),
  en: z.string().optional().default(''),
  ru: z.string().optional().default(''),
});

export const localizedOptionalInput = z.object({
  hy: z.string().optional().default(''),
  en: z.string().optional().default(''),
  ru: z.string().optional().default(''),
});

export const phone = z
  .string()
  .min(6, 'Phone number is too short')
  .max(32)
  .regex(/^[+0-9()\-\s]+$/, 'Phone number contains invalid characters');

/**
 * Media may be an absolute Cloudinary/CDN URL or a root-relative path served by the
 * web app (the seeded artwork lives under /images/seed).
 */
export const imageUrl = z
  .string()
  .min(1)
  .max(2048)
  .refine((value) => value.startsWith('/') || value.toLowerCase().startsWith('http'), {
    message: 'Must be an absolute URL or a root-relative path',
  });
