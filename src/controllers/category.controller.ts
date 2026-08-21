import type { Request, Response } from 'express';
import { Category } from '../models/Category';
import { Collection } from '../models/Collection';
import { categoryTree, descendantIds } from '../repositories/category.repository';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { ok } from '../utils/apiResponse';

export const tree = asyncHandler(async (req: Request, res: Response) => {
  const navOnly = req.query.nav === 'true';
  return ok(res, await categoryTree(navOnly));
});

export const bySlug = asyncHandler(async (req: Request, res: Response) => {
  const category = await Category.findOne({ slug: req.params.slug, isActive: true }).populate('ancestors', 'slug name');
  if (!category) throw ApiError.notFound('Category not found');

  const children = await Category.find({ parent: category._id, isActive: true }).sort({ order: 1 });
  const ids = await descendantIds(category._id);

  return ok(res, { category, children, descendantIds: ids });
});

export const collections = asyncHandler(async (req: Request, res: Response) => {
  const filter: Record<string, unknown> = { isActive: true };
  if (req.query.home === 'true') filter.showOnHome = true;
  const items = await Collection.find(filter).sort({ order: 1 }).lean();
  return ok(res, items);
});

export const collectionBySlug = asyncHandler(async (req: Request, res: Response) => {
  const collection = await Collection.findOne({ slug: req.params.slug, isActive: true }).populate({
    path: 'products',
    match: { isActive: true },
    select: 'slug name price compareAtPrice thumbnail images badges ratingAverage ratingCount deliveryMethods',
  });
  if (!collection) throw ApiError.notFound('Collection not found');
  return ok(res, collection);
});
