import type { Request, Response } from 'express';
import { Inquiry } from '../models/Inquiry';
import { Media } from '../models/Media';
import { Order } from '../models/Order';
import { Post } from '../models/Post';
import { Review } from '../models/Review';
import { Setting } from '../models/Setting';
import { Subscription } from '../models/Subscription';
import { User } from '../models/User';
import { findOrders } from '../repositories/order.repository';
import * as orderService from '../services/order.service';
import { dashboardStats } from '../services/stats.service';
import { deleteMedia, uploadMedia } from '../services/media.service';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { buildPage, parsePaging } from '../utils/pagination';
import { created, noContent, ok, paginated } from '../utils/apiResponse';
import { uniqueSlug } from '../utils/slug';
import { pickLocale } from '../models/common';
import type { AuthedRequest } from '../types';
import { containsRegex } from '../utils/regex';

/* ------------------------------ dashboard ------------------------------ */

export const stats = asyncHandler(async (_req: Request, res: Response) => ok(res, await dashboardStats()));

/* -------------------------------- orders ------------------------------- */

export const listOrders = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit } = parsePaging(req.query);
  const q = req.query as Record<string, string | undefined>;

  const result = await findOrders({
    page,
    limit,
    status: q.status as never,
    paymentStatus: q.paymentStatus as never,
    search: q.q,
    from: q.from ? new Date(q.from) : undefined,
    to: q.to ? new Date(q.to) : undefined,
  });

  return paginated(res, result);
});

export const getOrder = asyncHandler(async (req: Request, res: Response) => {
  const order = await Order.findById(req.params.id).populate('user', 'name email phone grade points');
  if (!order) throw ApiError.notFound('Order not found');
  return ok(res, order);
});

export const changeOrderStatus = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const order = await orderService.changeStatus(req.params.id, req.body.status, req.user!.sub, req.body.note);
  return ok(res, order);
});

export const changePaymentStatus = asyncHandler(async (req: Request, res: Response) => {
  const order = await orderService.setPaymentStatus(req.params.id, req.body.paymentStatus);
  return ok(res, order);
});

export const updateOrderNote = asyncHandler(async (req: Request, res: Response) => {
  const order = await Order.findByIdAndUpdate(req.params.id, { adminNote: req.body.adminNote }, { new: true });
  if (!order) throw ApiError.notFound('Order not found');
  return ok(res, order);
});

/* -------------------------------- users -------------------------------- */

export const listUsers = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = parsePaging(req.query);
  const q = req.query as Record<string, string | undefined>;

  const filter: Record<string, unknown> = {};
  if (q.role) filter.role = q.role;
  if (q.q) {
    const rx = containsRegex(q.q);
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }

  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    User.countDocuments(filter),
  ]);

  return paginated(res, buildPage(items, total, page, limit));
});

export const getUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');

  const [orders, subscriptions] = await Promise.all([
    Order.find({ user: user._id }).sort({ createdAt: -1 }).limit(20).lean(),
    Subscription.find({ user: user._id }).populate('plan', 'name').lean(),
  ]);

  return ok(res, { user, orders, subscriptions });
});

/** Role changes are guarded so an admin cannot lock everyone out by demoting themselves. */
export const updateUserRole = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (req.params.id === req.user!.sub) throw ApiError.badRequest('You cannot change your own role');

  const user = await User.findByIdAndUpdate(req.params.id, { role: req.body.role }, { new: true });
  if (!user) throw ApiError.notFound('User not found');
  return ok(res, user);
});

export const setUserActive = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (req.params.id === req.user!.sub) throw ApiError.badRequest('You cannot deactivate your own account');

  const user = await User.findByIdAndUpdate(req.params.id, { isActive: req.body.isActive }, { new: true });
  if (!user) throw ApiError.notFound('User not found');
  return ok(res, user);
});

/* -------------------------------- posts -------------------------------- */

export const listPosts = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = parsePaging(req.query);
  const filter: Record<string, unknown> = {};
  if (req.query.type) filter.type = req.query.type;

  const [items, total] = await Promise.all([
    Post.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).select('-body').lean(),
    Post.countDocuments(filter),
  ]);

  return paginated(res, buildPage(items, total, page, limit));
});

export const createPost = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const slug = req.body.slug || (await uniqueSlug(pickLocale(req.body.title), async (c) => Boolean(await Post.exists({ slug: c }))));
  const post = await Post.create({ ...req.body, slug, author: req.user!.sub });
  return created(res, post);
});

export const updatePost = asyncHandler(async (req: Request, res: Response) => {
  const post = await Post.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!post) throw ApiError.notFound('Post not found');
  return ok(res, post);
});

export const deletePost = asyncHandler(async (req: Request, res: Response) => {
  const post = await Post.findByIdAndDelete(req.params.id);
  if (!post) throw ApiError.notFound('Post not found');
  return noContent(res);
});

/* ------------------------- reviews and inquiries ------------------------ */

export const listReviews = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = parsePaging(req.query);
  const filter: Record<string, unknown> = {};
  if (req.query.approved !== undefined) filter.isApproved = req.query.approved === 'true';

  const [items, total] = await Promise.all([
    Review.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
      .populate('user', 'name email').populate('product', 'name slug thumbnail').lean(),
    Review.countDocuments(filter),
  ]);

  return paginated(res, buildPage(items, total, page, limit));
});

export const setReviewApproval = asyncHandler(async (req: Request, res: Response) => {
  const review = await Review.findByIdAndUpdate(req.params.id, { isApproved: req.body.isApproved }, { new: true });
  if (!review) throw ApiError.notFound('Review not found');
  return ok(res, review);
});

export const listInquiries = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = parsePaging(req.query);
  const filter: Record<string, unknown> = {};
  if (req.query.status) filter.status = req.query.status;

  const [items, total] = await Promise.all([
    Inquiry.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
      .populate('user', 'name email').populate('product', 'name slug').lean(),
    Inquiry.countDocuments(filter),
  ]);

  return paginated(res, buildPage(items, total, page, limit));
});

export const answerInquiry = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const inquiry = await Inquiry.findByIdAndUpdate(
    req.params.id,
    {
      status: 'answered',
      answer: { body: req.body.body, answeredAt: new Date(), answeredBy: req.user!.sub },
    },
    { new: true },
  );
  if (!inquiry) throw ApiError.notFound('Inquiry not found');
  return ok(res, inquiry);
});

/* -------------------------------- media -------------------------------- */

export const listMedia = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = parsePaging(req.query);
  const filter: Record<string, unknown> = {};
  if (req.query.folder) filter.folder = req.query.folder;

  const [items, total] = await Promise.all([
    Media.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Media.countDocuments(filter),
  ]);

  return paginated(res, buildPage(items, total, page, limit));
});

export const upload = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? (req.file ? [req.file] : []);
  if (files.length === 0) throw ApiError.badRequest('No file was uploaded');

  const uploaded = [];
  for (const file of files) {
    uploaded.push(
      await uploadMedia({
        buffer: file.buffer,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        folder: (req.body.folder as string) || 'products',
        alt: req.body.alt as string | undefined,
        uploadedBy: req.user!.sub,
      }),
    );
  }

  return created(res, uploaded.length === 1 ? uploaded[0] : uploaded);
});

export const removeMedia = asyncHandler(async (req: Request, res: Response) => {
  await deleteMedia(req.params.id);
  return noContent(res);
});

/* ------------------------------- settings ------------------------------ */

export const getSettings = asyncHandler(async (_req: Request, res: Response) => {
  const doc = await Setting.findOneAndUpdate({ key: 'storefront' }, {}, { new: true, upsert: true });
  return ok(res, doc);
});

export const updateSettings = asyncHandler(async (req: Request, res: Response) => {
  const doc = await Setting.findOneAndUpdate({ key: 'storefront' }, { $set: req.body }, { new: true, upsert: true });
  return ok(res, doc);
});
