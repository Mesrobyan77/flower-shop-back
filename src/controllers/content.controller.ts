import type { Request, Response } from 'express';
import { Post } from '../models/Post';
import { Setting } from '../models/Setting';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { buildPage, parsePaging } from '../utils/pagination';
import { ok, paginated } from '../utils/apiResponse';
import { containsRegex } from '../utils/regex';

export const listPosts = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = parsePaging(req.query);
  const q = req.query as Record<string, string | undefined>;

  const filter: Record<string, unknown> = { isPublished: true };
  if (q.type) filter.type = q.type;
  if (q.tag) filter.tags = q.tag;
  if (q.q) {
    const rx = containsRegex(q.q);
    filter.$or = [{ 'title.hy': rx }, { 'title.en': rx }, { 'title.ru': rx }];
  }

  const [items, total] = await Promise.all([
    Post.find(filter).sort({ isPinned: -1, publishedAt: -1 }).skip(skip).limit(limit).select('-body').lean(),
    Post.countDocuments(filter),
  ]);

  return paginated(res, buildPage(items, total, page, limit));
});

export const postBySlug = asyncHandler(async (req: Request, res: Response) => {
  const post = await Post.findOneAndUpdate(
    { slug: req.params.slug, isPublished: true },
    { $inc: { viewCount: 1 } },
    { new: true },
  );
  if (!post) throw ApiError.notFound('Post not found');
  return ok(res, post);
});

/** Storefront chrome: promo bar, hero slides, theme tiles, counters, contacts. */
export const settings = asyncHandler(async (_req: Request, res: Response) => {
  const doc = await Setting.findOne({ key: 'storefront' }).lean();
  return ok(res, doc ?? {});
});
