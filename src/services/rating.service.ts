import { Types } from 'mongoose';
import { Product } from '../models/Product';
import { Review } from '../models/Review';

/**
 * The advertised rating is always derived from approved reviews: the seeded
 * catalogue ships no rating of its own, so anything else on screen would be
 * a number nobody gave us (F-33).
 */
export async function refreshProductRating(productId: unknown) {
  const [row] = await Review.aggregate<{ avg: number; count: number }>([
    { $match: { product: new Types.ObjectId(String(productId)), isApproved: true } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);

  await Product.updateOne(
    { _id: productId },
    { $set: { ratingAverage: Math.round((row?.avg ?? 0) * 10) / 10, ratingCount: row?.count ?? 0 } },
  );
}

/** Approved-review totals for every product that has at least one. */
export async function approvedRatingsByProduct() {
  const rows = await Review.aggregate<{ _id: unknown; avg: number; count: number }>([
    { $match: { isApproved: true } },
    { $group: { _id: '$product', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);

  return new Map(rows.map((row) => [String(row._id), { average: Math.round(row.avg * 10) / 10, count: row.count }]));
}

/** Rebuilds every product's rating fields from the approved review set. */
export async function syncAllProductRatings() {
  const byProduct = await approvedRatingsByProduct();
  const products = await Product.find().select('_id').lean();

  await Promise.all(
    products.map((product) => {
      const row = byProduct.get(String(product._id));
      return Product.updateOne(
        { _id: product._id },
        { $set: { ratingAverage: row?.average ?? 0, ratingCount: row?.count ?? 0 } },
      );
    }),
  );

  return { products: products.length, withReviews: byProduct.size };
}
