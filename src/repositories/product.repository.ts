import type { FilterQuery, SortOrder } from 'mongoose';
import { Product, type ProductDocument } from '../models/Product';
import { buildPage } from '../utils/pagination';
import type { ProductBadge, SortOption } from '../constants';
import { containsRegex } from '../utils/regex';

export interface ProductQuery {
  page: number;
  limit: number;
  categoryIds?: string[];
  collectionProductIds?: string[];
  search?: string;
  slug?: string;
  minPrice?: number;
  maxPrice?: number;
  badges?: ProductBadge[];
  deliveryMethod?: string;
  sameDayOnly?: boolean;
  featuredOnly?: boolean;
  includeInactive?: boolean;
  sort?: SortOption;
  ids?: string[];
}

const SORT_MAP: Record<SortOption, Record<string, SortOrder>> = {
  recommended: { isFeatured: -1, order: 1, soldCount: -1 },
  newest: { publishedAt: -1, createdAt: -1 },
  price_asc: { price: 1 },
  price_desc: { price: -1 },
  popular: { soldCount: -1, viewCount: -1 },
  review: { ratingAverage: -1, ratingCount: -1 },
};

export function buildProductFilter(q: ProductQuery): FilterQuery<ProductDocument> {
  const filter: FilterQuery<ProductDocument> = {};

  if (!q.includeInactive) filter.isActive = true;
  if (q.slug) filter.slug = q.slug;
  if (q.ids?.length) filter._id = { $in: q.ids };
  if (q.categoryIds?.length) filter.categoryPath = { $in: q.categoryIds };
  if (q.collectionProductIds?.length) {
    filter._id = filter._id ? { $in: q.collectionProductIds } : { $in: q.collectionProductIds };
  }
  if (q.badges?.length) filter.badges = { $in: q.badges };
  if (q.deliveryMethod) filter.deliveryMethods = q.deliveryMethod;
  if (q.sameDayOnly) filter.sameDayAvailable = true;
  if (q.featuredOnly) filter.isFeatured = true;

  if (q.minPrice !== undefined || q.maxPrice !== undefined) {
    filter.price = {};
    if (q.minPrice !== undefined) filter.price.$gte = q.minPrice;
    if (q.maxPrice !== undefined) filter.price.$lte = q.maxPrice;
  }

  if (q.search?.trim()) {
    const rx = containsRegex(q.search.trim());
    filter.$or = [{ 'name.hy': rx }, { 'name.en': rx }, { 'name.ru': rx }, { sku: rx }];
  }

  return filter;
}

export async function findProducts(q: ProductQuery) {
  const filter = buildProductFilter(q);
  const sort = SORT_MAP[q.sort ?? 'recommended'];
  const skip = (q.page - 1) * q.limit;

  const [items, total] = await Promise.all([
    Product.find(filter).sort(sort).skip(skip).limit(q.limit).populate('category', 'slug name').lean(),
    Product.countDocuments(filter),
  ]);

  return buildPage(items, total, q.page, q.limit);
}

export function findProductBySlug(slug: string, includeInactive = false) {
  const filter: FilterQuery<ProductDocument> = { slug };
  if (!includeInactive) filter.isActive = true;
  return Product.findOne(filter).populate('category', 'slug name code').lean();
}

export function findProductById(id: string) {
  return Product.findById(id);
}

/** Price bounds power the catalog price filter UI. */
export async function priceRange(categoryIds?: string[]) {
  const match: FilterQuery<ProductDocument> = { isActive: true };
  if (categoryIds?.length) match.categoryPath = { $in: categoryIds };

  const [row] = await Product.aggregate<{ min: number; max: number }>([
    { $match: match },
    { $group: { _id: null, min: { $min: '$price' }, max: { $max: '$price' } } },
    { $project: { _id: 0, min: 1, max: 1 } },
  ]);

  return row ?? { min: 0, max: 0 };
}
