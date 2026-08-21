import { z } from 'zod';
import { DELIVERY_METHODS, LOCALES, PRODUCT_BADGES, SORT_OPTIONS } from '../constants';
import { imageUrl, localizedInput, localizedOptionalInput, objectId } from './common.validator';

export const productListQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(60).optional(),
  category: z.string().optional(),
  collection: z.string().optional(),
  q: z.string().max(120).optional(),
  min: z.coerce.number().min(0).optional(),
  max: z.coerce.number().min(0).optional(),
  badge: z.enum(PRODUCT_BADGES).optional(),
  delivery: z.enum(DELIVERY_METHODS).optional(),
  sameDay: z.coerce.boolean().optional(),
  featured: z.coerce.boolean().optional(),
  sort: z.enum(SORT_OPTIONS).optional(),
  locale: z.enum(LOCALES).optional(),
});

const optionInput = z.object({
  key: z.string().min(1),
  label: localizedInput,
  priceDelta: z.number().int().default(0),
  isAvailable: z.boolean().default(true),
  order: z.number().int().default(0),
});

const optionGroupInput = z.object({
  key: z.string().min(1),
  label: localizedInput,
  helpText: localizedOptionalInput.optional(),
  type: z.enum(['select', 'text', 'textarea', 'date', 'time']).default('select'),
  required: z.boolean().default(false),
  maxLength: z.number().int().positive().optional(),
  order: z.number().int().default(0),
  options: z.array(optionInput).default([]),
});

export const createProductSchema = z.object({
  name: localizedInput,
  slug: z.string().optional(),
  sku: z.string().optional(),
  shortDescription: localizedOptionalInput.optional(),
  description: localizedOptionalInput.optional(),
  careGuide: localizedOptionalInput.optional(),
  category: objectId,
  price: z.number().int().min(0),
  compareAtPrice: z.number().int().min(0).optional(),
  images: z.array(z.object({ url: imageUrl, alt: z.string().optional(), order: z.number().int().default(0) })).default([]),
  thumbnail: imageUrl.optional(),
  optionGroups: z.array(optionGroupInput).default([]),
  deliveryMethods: z.array(z.enum(DELIVERY_METHODS)).min(1, 'Choose at least one delivery method'),
  badges: z.array(z.enum(PRODUCT_BADGES)).default([]),
  origin: localizedOptionalInput.optional(),
  composition: localizedOptionalInput.optional(),
  size: localizedOptionalInput.optional(),
  stock: z.number().int().min(0).default(0),
  trackStock: z.boolean().default(false),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  sameDayAvailable: z.boolean().default(true),
  minOrderQty: z.number().int().min(1).default(1),
  maxOrderQty: z.number().int().min(1).default(20),
  order: z.number().int().default(0),
});

export const updateProductSchema = createProductSchema.partial();

export const createCategorySchema = z.object({
  code: z.string().min(1).max(20),
  slug: z.string().optional(),
  name: localizedInput,
  description: localizedOptionalInput.optional(),
  parent: objectId.nullable().optional(),
  image: imageUrl.optional(),
  icon: z.string().optional(),
  order: z.number().int().default(0),
  isActive: z.boolean().default(true),
  showInNav: z.boolean().default(true),
});

export const updateCategorySchema = createCategorySchema.partial();

export const createCollectionSchema = z.object({
  slug: z.string().optional(),
  title: localizedInput,
  subtitle: localizedOptionalInput.optional(),
  description: localizedOptionalInput.optional(),
  coverImage: imageUrl.optional(),
  bannerImage: imageUrl.optional(),
  products: z.array(objectId).default([]),
  order: z.number().int().default(0),
  isActive: z.boolean().default(true),
  showOnHome: z.boolean().default(false),
});

export const updateCollectionSchema = createCollectionSchema.partial();
