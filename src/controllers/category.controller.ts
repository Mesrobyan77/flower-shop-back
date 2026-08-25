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

/**
 * Fields a product card paints. Both collection endpoints populate the same
 * shape so the home rails and the collection page render identical cards.
 */
const CARD_FIELDS =
  'slug name price compareAtPrice thumbnail images badges ratingAverage ratingCount soldCount sameDayAvailable deliveryMethods';

export const collections = asyncHandler(async (req: Request, res: Response) => {
  const filter: Record<string, unknown> = { isActive: true };
  if (req.query.home === 'true') filter.showOnHome = true;

  // The home page renders these as product rails, so the products come back
  // populated rather than as bare ids.
  const items = await Collection.find(filter)
    .sort({ order: 1 })
    .populate({ path: 'products', match: { isActive: true }, select: CARD_FIELDS })
    .lean();

  return ok(res, items);
});

export const collectionBySlug = asyncHandler(async (req: Request, res: Response) => {
  const collection = await Collection.findOne({ slug: req.params.slug, isActive: true }).populate({
    path: 'products',
    match: { isActive: true },
    select: CARD_FIELDS,
  });
  if (!collection) throw ApiError.notFound('Collection not found');
  return ok(res, collection);
});
