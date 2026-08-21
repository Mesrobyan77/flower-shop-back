import type { Response } from 'express';
import { Address } from '../models/Address';
import { Order } from '../models/Order';
import { Product } from '../models/Product';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { created, noContent, ok } from '../utils/apiResponse';
import { MEMBER_GRADES, gradeByKey } from '../constants';
import type { AuthedRequest } from '../types';

export const summary = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const userId = req.user!.sub;
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');

  const [orderCount, activeCount, wishlistCount] = await Promise.all([
    Order.countDocuments({ user: userId }),
    Order.countDocuments({ user: userId, status: { $in: ['pending', 'confirmed', 'preparing', 'delivering'] } }),
    User.findById(userId).then((u) => u?.wishlist.length ?? 0),
  ]);

  const grade = gradeByKey(user.grade);
  const nextGrade = MEMBER_GRADES.find((g) => g.order === grade.order + 1);

  return ok(res, {
    points: user.points,
    totalSpend: user.totalSpend,
    grade: { ...grade, next: nextGrade ? { key: nextGrade.key, minSpend: nextGrade.minSpend } : null },
    orderCount,
    activeCount,
    wishlistCount,
  });
});

export const listAddresses = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const items = await Address.find({ user: req.user!.sub }).sort({ isDefault: -1, updatedAt: -1 });
  return ok(res, items);
});

export const createAddress = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const userId = req.user!.sub;
  if (req.body.isDefault) await Address.updateMany({ user: userId }, { $set: { isDefault: false } });

  const count = await Address.countDocuments({ user: userId });
  const address = await Address.create({ ...req.body, user: userId, isDefault: req.body.isDefault || count === 0 });
  return created(res, address);
});

export const updateAddress = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const userId = req.user!.sub;
  if (req.body.isDefault) await Address.updateMany({ user: userId }, { $set: { isDefault: false } });

  const address = await Address.findOneAndUpdate({ _id: req.params.id, user: userId }, req.body, {
    new: true,
    runValidators: true,
  });
  if (!address) throw ApiError.notFound('Address not found');
  return ok(res, address);
});

export const deleteAddress = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const result = await Address.findOneAndDelete({ _id: req.params.id, user: req.user!.sub });
  if (!result) throw ApiError.notFound('Address not found');
  return noContent(res);
});

export const wishlist = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const user = await User.findById(req.user!.sub).populate({
    path: 'wishlist',
    match: { isActive: true },
    select: 'slug name price compareAtPrice thumbnail images badges ratingAverage ratingCount',
  });
  return ok(res, user?.wishlist ?? []);
});

export const toggleWishlist = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const userId = req.user!.sub;
  const productId = req.params.id;

  const product = await Product.findById(productId);
  if (!product) throw ApiError.notFound('Product not found');

  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');

  const has = user.wishlist.some((p) => String(p) === productId);

  if (has) {
    await User.updateOne({ _id: userId }, { $pull: { wishlist: product._id } });
    await Product.updateOne({ _id: product._id }, { $inc: { wishlistCount: -1 } });
  } else {
    await User.updateOne({ _id: userId }, { $addToSet: { wishlist: product._id } });
    await Product.updateOne({ _id: product._id }, { $inc: { wishlistCount: 1 } });
  }

  return ok(res, { productId, inWishlist: !has });
});

export const recentlyViewed = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const user = await User.findById(req.user!.sub).populate({
    path: 'recentlyViewed',
    match: { isActive: true },
    select: 'slug name price thumbnail images',
  });
  return ok(res, user?.recentlyViewed ?? []);
});
