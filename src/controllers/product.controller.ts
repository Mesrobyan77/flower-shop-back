import type { Request, Response } from 'express';
import { Category } from '../models/Category';
import { Collection } from '../models/Collection';
import { Product } from '../models/Product';
import { User } from '../models/User';
import { breadcrumb, descendantIds } from '../repositories/category.repository';
import { findProducts, priceRange } from '../repositories/product.repository';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { toDateKey } from '../utils/dateKey';
import { ok, paginated } from '../utils/apiResponse';
import { parsePaging } from '../utils/pagination';
import { availableTimeSlots, deliveryCalendar, earliestDeliveryDate } from '../services/delivery.service';
import type { AuthedRequest } from '../types';
import type { SortOption } from '../constants';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as Record<string, string | undefined>;
  const { page, limit } = parsePaging(q);

  let categoryIds: string[] | undefined;
  if (q.category) {
    const category = await Category.findOne({ slug: q.category, isActive: true });
    if (!category) throw ApiError.notFound('Category not found');
    categoryIds = await descendantIds(category._id);
  }

  let collectionProductIds: string[] | undefined;
  if (q.collection) {
    const collection = await Collection.findOne({ slug: q.collection, isActive: true });
    if (!collection) throw ApiError.notFound('Collection not found');
    collectionProductIds = collection.products.map(String);
  }

  const result = await findProducts({
    page,
    limit,
    categoryIds,
    collectionProductIds,
    search: q.q,
    minPrice: q.min !== undefined ? Number(q.min) : undefined,
    maxPrice: q.max !== undefined ? Number(q.max) : undefined,
    badges: q.badge ? [q.badge as never] : undefined,
    deliveryMethod: q.delivery,
    sameDayOnly: q.sameDay === 'true',
    featuredOnly: q.featured === 'true',
    sort: (q.sort as SortOption) ?? 'recommended',
  });

  return paginated(res, result);
});

export const detail = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const product = await Product.findOne({ slug: req.params.slug, isActive: true }).populate('category', 'slug name code');
  if (!product) throw ApiError.notFound('Product not found');

  await Product.updateOne({ _id: product._id }, { $inc: { viewCount: 1 } });

  if (req.user) {
    await User.updateOne({ _id: req.user.sub }, { $pull: { recentlyViewed: product._id } });
    await User.updateOne(
      { _id: req.user.sub },
      { $push: { recentlyViewed: { $each: [product._id], $position: 0, $slice: 12 } } },
    );
  }

  const crumbs = await breadcrumb(product.category);

  const delivery = product.deliveryMethods.map((method) => ({
    method,
    earliestDate: toDateKey(earliestDeliveryDate(method)),
    timeSlots: availableTimeSlots(method),
    calendar: deliveryCalendar(method, 21),
  }));

  const related = await Product.find({
    _id: { $ne: product._id },
    category: product.category,
    isActive: true,
  })
    .sort({ soldCount: -1 })
    .limit(8)
    .select('slug name price compareAtPrice thumbnail images badges ratingAverage ratingCount')
    .lean();

  return ok(res, { product, breadcrumb: crumbs, delivery, related });
});

export const facets = asyncHandler(async (req: Request, res: Response) => {
  const slug = req.query.category as string | undefined;
  let categoryIds: string[] | undefined;

  if (slug) {
    const category = await Category.findOne({ slug, isActive: true });
    if (category) categoryIds = await descendantIds(category._id);
  }

  const range = await priceRange(categoryIds);
  return ok(res, { price: range });
});

export const newArrivals = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit } = parsePaging(req.query);
  const result = await findProducts({ page, limit, sort: 'newest' });
  return paginated(res, result);
});

export const bestSellers = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit } = parsePaging(req.query);
  const result = await findProducts({ page, limit, sort: 'popular' });
  return paginated(res, result);
});
