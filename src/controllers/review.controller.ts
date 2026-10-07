import type { Request, Response } from 'express';
import { Order } from '../models/Order';
import { Product } from '../models/Product';
import { Review } from '../models/Review';
import { refreshProductRating } from '../services/rating.service';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { buildPage, parsePaging } from '../utils/pagination';
import { created, noContent, ok, paginated } from '../utils/apiResponse';
import type { AuthedRequest } from '../types';

export const listForProduct = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = parsePaging(req.query);
  const filter: Record<string, unknown> = { isApproved: true };

  const product = await Product.findOne({ slug: req.params.slug });
  if (!product) throw ApiError.notFound('Product not found');
  filter.product = product._id;

  if (req.query.rating) filter.rating = Number(req.query.rating);

  const [items, total, distribution] = await Promise.all([
    Review.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('user', 'name grade').lean(),
    Review.countDocuments(filter),
    Review.aggregate([
      { $match: { product: product._id, isApproved: true } },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
      { $sort: { _id: -1 } },
    ]),
  ]);

  /** The summary is computed from the same approved set the list shows, never from a cached field. */
  const approvedCount = distribution.reduce((acc, row) => acc + row.count, 0);
  const approvedSum = distribution.reduce((acc, row) => acc + row._id * row.count, 0);

  return paginated(res, buildPage(items, total, page, limit), {
    summary: {
      average: approvedCount ? Math.round((approvedSum / approvedCount) * 10) / 10 : 0,
      count: approvedCount,
      distribution,
    },
  });
});

export const create = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const userId = req.user!.sub;

  const product = await Product.findById(req.body.product);
  if (!product) throw ApiError.notFound('Product not found');

  const delivered = await Order.findOne({
    user: userId,
    'items.product': req.body.product,
    status: { $in: ['delivered', 'completed'] },
  });

  const review = await Review.create({
    ...req.body,
    user: userId,
    order: delivered?._id,
    isVerified: Boolean(delivered),
  });

  await refreshProductRating(req.body.product);
  return created(res, review);
});

export const remove = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const review = await Review.findOne({ _id: req.params.id, user: req.user!.sub });
  if (!review) throw ApiError.notFound('Review not found');

  const productId = String(review.product);
  await review.deleteOne();
  await refreshProductRating(productId);
  return noContent(res);
});

/**
 * One vote per signed-in account. The claim and the counter move in a single
 * atomic update, so two concurrent clicks by the same account still add one,
 * and an anonymous caller - who could mint unlimited identities for free -
 * never reaches this code at all.
 */
export const markHelpful = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const voter = req.user!.sub;
  const review = await Review.findOneAndUpdate(
    { _id: req.params.id, helpfulBy: { $ne: voter } },
    { $addToSet: { helpfulBy: voter }, $inc: { helpfulCount: 1 } },
    { new: true },
  );

  if (!review) {
    const existing = await Review.findById(req.params.id).select('helpfulCount');
    if (!existing) throw ApiError.notFound('Review not found');
    // Already voted: report the unchanged total rather than a second increment.
    return ok(res, { helpfulCount: existing.helpfulCount });
  }

  return ok(res, { helpfulCount: review.helpfulCount });
});
