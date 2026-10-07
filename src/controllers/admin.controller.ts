import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Category } from '../models/Category';
import { Collection } from '../models/Collection';
import { Inquiry } from '../models/Inquiry';
import { Media } from '../models/Media';
import { Order } from '../models/Order';
import { Post } from '../models/Post';
import { Product } from '../models/Product';
import { RefreshSession } from '../models/RefreshSession';
import { Review } from '../models/Review';
import { Setting } from '../models/Setting';
import { Subscription } from '../models/Subscription';
import { User } from '../models/User';
import { findOrders } from '../repositories/order.repository';
import * as orderService from '../services/order.service';
import { dashboardStats } from '../services/stats.service';
import { refreshProductRating } from '../services/rating.service';
import { deleteMedia, uploadMedia } from '../services/media.service';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { buildPage, parsePaging } from '../utils/pagination';
import { toMongoUpdate } from '../utils/mongoUpdate';
import { created, noContent, ok, paginated } from '../utils/apiResponse';
import { uniqueSlug } from '../utils/slug';
import { pickLocale } from '../models/common';
import type { AuthedRequest } from '../types';
import { containsRegex } from '../utils/regex';
import { endOfDateKey, fromDateKey } from '../utils/dateKey';

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
    // Date-only filters are shop calendar days; full timestamps pass through.
    from: q.from ? fromDateKey(q.from) : undefined,
    to: q.to ? (/^\d{4}-\d{2}-\d{2}$/.test(q.to.trim()) ? endOfDateKey(q.to.trim()) : new Date(q.to)) : undefined,
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
    // Data minimisation: the users table paints six columns, so the list ships only those.
    User.find(filter)
      .select('name email role grade points totalSpend isActive createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
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

  // Deactivation also ends the account's refresh sessions, so no new access
  // token can be minted behind the disabled flag even by a stolen cookie.
  if (!user.isActive) {
    await RefreshSession.updateMany(
      { user: user._id, revokedAt: null },
      { $set: { revokedAt: new Date(), revokedReason: 'account-disabled' } },
    );
  }

  return ok(res, user);
});

/* -------------------------------- posts -------------------------------- */

export const listPosts = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = parsePaging(req.query);
  const filter: Record<string, unknown> = {};
  if (req.query.type) filter.type = req.query.type;

  const [items, total] = await Promise.all([
    Post.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
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
  const post = await Post.findById(req.params.id);
  if (!post) throw ApiError.notFound('Post not found');

  const body: Record<string, unknown> = { ...req.body };

  /**
   * A slug is a live URL (magazine links and the sitemap both carry it), so a
   * rename only moves the address when the new one is free; the panel shows the
   * current slug and the API refuses a collision instead of silently overwriting
   * another post (F-86).
   */
  if (typeof body.slug === 'string' && body.slug !== post.slug) {
    const clash = await Post.exists({ slug: body.slug, _id: { $ne: post._id } });
    if (clash) throw ApiError.conflict('That address is already used by another post');
  }

  const updated = await Post.findByIdAndUpdate(req.params.id, toMongoUpdate(body), { new: true, runValidators: true });
  if (!updated) throw ApiError.notFound('Post not found');
  return ok(res, updated);
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
  // Moderating a review changes the approved set, so the advertised rating must move with it.
  await refreshProductRating(review.product);
  return ok(res, review);
});

export const deleteReview = asyncHandler(async (req: Request, res: Response) => {
  const review = await Review.findByIdAndDelete(req.params.id);
  if (!review) throw ApiError.notFound('Review not found');
  await refreshProductRating(review.product);
  return noContent(res);
});

export const replyToReview = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const review = await Review.findByIdAndUpdate(
    req.params.id,
    { adminReply: { body: req.body.body, repliedAt: new Date(), repliedBy: req.user!.sub } },
    { new: true },
  );
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

/** Answering is revisable: an admin can correct or extend a saved answer. */
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

/** Reopens an answered thread or closes it - the model's whole lifecycle is reachable. */
export const setInquiryStatus = asyncHandler(async (req: Request, res: Response) => {
  const inquiry = await Inquiry.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
  if (!inquiry) throw ApiError.notFound('Inquiry not found');
  return ok(res, inquiry);
});

/* -------------------------------- media -------------------------------- */

export const listMedia = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = parsePaging(req.query);
  const q = req.query as Record<string, string | undefined>;

  const filter: Record<string, unknown> = {};
  if (q.folder) filter.folder = q.folder;
  if (q.q) {
    const rx = containsRegex(q.q);
    filter.$or = [{ originalName: rx }, { key: rx }, { alt: rx }];
  }

  const [items, total] = await Promise.all([
    Media.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Media.countDocuments(filter),
  ]);

  return paginated(res, buildPage(items, total, page, limit));
});

/** Every folder the library actually holds, so the picker can offer a real choice. */
export const mediaFolders = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await Media.aggregate<{ _id: string; count: number }>([
    { $group: { _id: '$folder', count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, folder: '$_id', count: 1 } },
  ]);
  return ok(res, rows);
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

  /** Always a list, so a multi-file batch can report each result separately. */
  return created(res, uploaded);
});

/** The folders and entity fields an asset can be referenced through. */
async function findMediaReferences(media: { _id: Types.ObjectId; url: string; key: string }) {
  const usedBy: string[] = [];
  if (await Product.exists({ $or: [{ thumbnail: media.url }, { 'images.url': media.url }, { 'images.mediaId': media._id }] })) {
    usedBy.push('product');
  }
  if (await Category.exists({ $or: [{ image: media.url }, { icon: media.url }] })) usedBy.push('category');
  if (await Collection.exists({ $or: [{ coverImage: media.url }, { bannerImage: media.url }] })) usedBy.push('collection');
  if (await Post.exists({ coverImage: media.url })) usedBy.push('post');

  const settings = await Setting.findOne({ key: 'storefront' }).lean();
  const slideUrls = [
    ...(settings?.heroSlides ?? []).flatMap((slide) => [slide.image, slide.mobileImage]),
    ...(settings?.themeTiles ?? []).map((tile) => tile.image),
  ];
  if (slideUrls.includes(media.url)) usedBy.push('home page');

  return usedBy;
}

export const removeMedia = asyncHandler(async (req: Request, res: Response) => {
  const media = await Media.findById(req.params.id);
  if (!media) throw ApiError.notFound('Media not found');

  /**
   * Entities store the delivered URL as a plain string, so destroying the file
   * would break every page that shows it with no way back except re-uploading
   * (F-90). The asset has to be released by those records first.
   */
  const usedBy = await findMediaReferences(media);
  if (usedBy.length) throw ApiError.badRequest(`This image is used by a ${usedBy.join(', ')} - remove it there first`);

  await deleteMedia(String(media._id));
  return noContent(res);
});

/* ------------------------------- settings ------------------------------ */

export const getSettings = asyncHandler(async (_req: Request, res: Response) => {
  const doc = await Setting.findOneAndUpdate({ key: 'storefront' }, {}, { new: true, upsert: true });
  return ok(res, doc);
});

/** The storefront document is the only thing this endpoint may write. */
const SETTINGS_FIELDS = ['promoBar', 'heroSlides', 'themeTiles', 'counters', 'contact', 'social'] as const;

export const updateSettings = asyncHandler(async (req: Request, res: Response) => {
  const current = await Setting.findOne({ key: 'storefront' });
  if (!current) throw ApiError.notFound('Storefront settings not found');

  /**
   * The panel edits the whole document, so a second tab or a stale copy would
   * otherwise overwrite sections the admin never opened. The client echoes the
   * `updatedAt` it loaded, and a save against a newer document is refused (F-95).
   */
  const expected = typeof req.body.expectedUpdatedAt === 'string' ? req.body.expectedUpdatedAt : undefined;
  if (expected && expected !== current.updatedAt?.toISOString()) {
    throw ApiError.conflict('Someone saved the storefront settings while this page was open - reload before saving');
  }

  const patch: Record<string, unknown> = {};
  for (const field of SETTINGS_FIELDS) {
    if (field in req.body) patch[field] = req.body[field];
  }

  const doc = await Setting.findOneAndUpdate({ key: 'storefront' }, patch, {
    new: true,
    runValidators: true,
  });
  return ok(res, doc);
});
