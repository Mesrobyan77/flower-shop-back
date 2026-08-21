import type { Request, Response } from 'express';
import { Inquiry } from '../models/Inquiry';
import { Product } from '../models/Product';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { buildPage, parsePaging } from '../utils/pagination';
import { created, ok, paginated } from '../utils/apiResponse';
import type { AuthedRequest } from '../types';

/** Secret inquiries hide their body from everyone but the author and admins. */
function redact(row: Record<string, unknown>, viewerId?: string, isAdmin = false) {
  const authorId = String((row.user as { _id?: unknown })?._id ?? row.user ?? '');
  if (!row.isSecret || isAdmin || authorId === viewerId) return row;
  return { ...row, subject: null, body: null, answer: null, redacted: true };
}

export const listForProduct = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const { page, limit, skip } = parsePaging(req.query);

  const product = await Product.findOne({ slug: req.params.slug });
  if (!product) throw ApiError.notFound('Product not found');

  const filter = { product: product._id };
  const [items, total] = await Promise.all([
    Inquiry.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('user', 'name').lean(),
    Inquiry.countDocuments(filter),
  ]);

  const viewerId = req.user?.sub;
  const isAdmin = req.user?.role === 'admin';
  const safe = items.map((i) => redact(i as Record<string, unknown>, viewerId, isAdmin));

  return paginated(res, buildPage(safe, total, page, limit));
});

export const mine = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const { page, limit, skip } = parsePaging(req.query);
  const filter = { user: req.user!.sub };

  const [items, total] = await Promise.all([
    Inquiry.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('product', 'slug name thumbnail').lean(),
    Inquiry.countDocuments(filter),
  ]);

  return paginated(res, buildPage(items, total, page, limit));
});

export const create = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const inquiry = await Inquiry.create({ ...req.body, user: req.user!.sub });
  return created(res, inquiry);
});

export const detail = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const inquiry = await Inquiry.findById(req.params.id).populate('user', 'name').lean();
  if (!inquiry) throw ApiError.notFound('Inquiry not found');
  return ok(res, redact(inquiry as Record<string, unknown>, req.user?.sub, req.user?.role === 'admin'));
});
