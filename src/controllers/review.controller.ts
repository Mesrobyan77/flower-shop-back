import type { Request, Response } from 'express';
import { Order } from '../models/Order';
import { Product } from '../models/Product';
import { Review } from '../models/Review';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { buildPage, parsePaging } from '../utils/pagination';
import { created, noContent, ok, paginated } from '../utils/apiResponse';
import type { AuthedRequest } from '../types';

async function refreshProductRating(productId: string) {
  const [row] = await Review.aggregate<{ avg: number; count: number }>([
    { $match: { product: (await Product.findById(productId))!._id, isApproved: true } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);

  await Product.updateOne(
    { _id: productId },
    { $set: { ratingAverage: Math.round((row?.avg ?? 0) * 10) / 10, ratingCount: row?.count ?? 0 } },
  );
}

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

  return paginated(res, buildPage(items, total, page, limit), {
    summary: { average: product.ratingAverage, count: product.ratingCount, distribution },
  });
});

export const create = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const userId = req.user!.sub;

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

export const markHelpful = asyncHandler(async (req: Request, res: Response) => {
  const review = await Review.findByIdAndUpdate(req.params.id, { $inc: { helpfulCount: 1 } }, { new: true });
  if (!review) throw ApiError.notFound('Review not found');
  return ok(res, { helpfulCount: review.helpfulCount });
});
