import { z } from 'zod';
import { POST_TYPES, SUBSCRIPTION_CYCLES, REGION_KEYS } from '../constants';
import { imageUrl, localizedInput, localizedOptionalInput, objectId, phone } from './common.validator';

export const createReviewSchema = z.object({
  product: objectId,
  order: objectId.optional(),
  rating: z.number().int().min(1).max(5),
  title: z.string().max(120).optional(),
  body: z.string().min(5, 'Please write at least a few words').max(3000),
  images: z.array(imageUrl).max(6).default([]),
});

export const reviewListQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(60).optional(),
  product: objectId.optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
});

export const createInquirySchema = z.object({
  product: objectId.optional(),
  topic: z.enum(['product', 'order', 'delivery', 'general']).default('general'),
  subject: z.string().min(2).max(160),
  body: z.string().min(5).max(3000),
  isSecret: z.boolean().default(false),
});

export const answerInquirySchema = z.object({ body: z.string().min(2).max(3000) });

export const createPostSchema = z.object({
  type: z.enum(POST_TYPES),
  slug: z.string().optional(),
  title: localizedInput,
  excerpt: localizedOptionalInput.optional(),
  body: localizedInput,
  coverImage: imageUrl.optional(),
  tags: z.array(z.string().max(40)).default([]),
  category: z.string().max(60).optional(),
  isPublished: z.boolean().default(true),
  isPinned: z.boolean().default(false),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
});

export const updatePostSchema = createPostSchema.partial();

export const postListQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(60).optional(),
  type: z.enum(POST_TYPES).optional(),
  tag: z.string().max(40).optional(),
  q: z.string().max(120).optional(),
});

export const subscribeSchema = z.object({
  planId: objectId,
  cycle: z.enum(SUBSCRIPTION_CYCLES),
  recipient: z.string().min(2).max(80),
  phone,
  region: z.enum(REGION_KEYS as unknown as [string, ...string[]]),
  city: z.string().min(1).max(80),
  street: z.string().min(1).max(160),
  building: z.string().max(40).optional(),
  apartment: z.string().max(40).optional(),
  notes: z.string().max(400).optional(),
  startDate: z.string().optional(),
});

export const updateSettingsSchema = z.object({
  promoBar: z
    .object({ enabled: z.boolean(), text: localizedOptionalInput.optional(), href: z.string().optional() })
    .optional(),
  heroSlides: z
    .array(
      z.object({
        image: z.string(),
        mobileImage: z.string().optional(),
        title: localizedOptionalInput.optional(),
        subtitle: localizedOptionalInput.optional(),
        ctaLabel: localizedOptionalInput.optional(),
        href: z.string().optional(),
        theme: z.enum(['light', 'dark']).default('dark'),
        order: z.number().int().default(0),
      }),
    )
    .optional(),
  themeTiles: z
    .array(
      z.object({
        image: z.string().optional(),
        title: localizedInput,
        subtitle: localizedOptionalInput.optional(),
        href: z.string(),
        animated: z.boolean().default(false),
        order: z.number().int().default(0),
      }),
    )
    .optional(),
  counters: z
    .object({ reviews: z.number().int().min(0), deliveries: z.number().int().min(0), awardYears: z.number().int().min(0) })
    .optional(),
  contact: z
    .object({
      phone: z.string().max(40),
      overseasPhone: z.string().max(40).optional(),
      email: z.string().email(),
      hours: localizedOptionalInput.optional(),
      address: localizedOptionalInput.optional(),
    })
    .optional(),
  social: z
    .object({
      instagram: z.string().optional(),
      facebook: z.string().optional(),
      youtube: z.string().optional(),
      telegram: z.string().optional(),
    })
    .optional(),
});

export const adminUserListQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(60).optional(),
  q: z.string().max(120).optional(),
  role: z.enum(['user', 'admin']).optional(),
});

export const updateUserRoleSchema = z.object({ role: z.enum(['user', 'admin']) });
