import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Category, type CategoryDocument } from '../models/Category';
import { Collection } from '../models/Collection';
import { Media } from '../models/Media';
import { Order } from '../models/Order';
import { Product, type ProductImage } from '../models/Product';
import { Setting } from '../models/Setting';
import { findProducts } from '../repositories/product.repository';
import { revalidateStorefront } from '../services/storefrontCache';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { created, noContent, ok, paginated } from '../utils/apiResponse';
import { parsePaging } from '../utils/pagination';
import { generateSku } from '../utils/codes';
import { toMongoUpdate } from '../utils/mongoUpdate';
import { uniqueSlug } from '../utils/slug';
import { pickLocale } from '../models/common';
import type { SortOption } from '../constants';

/* ----------------------------- products ----------------------------- */

type IncomingImage = { url: string; alt?: string; order?: number };

/**
 * The image editor works on URLs, but a stored image also carries the alt text the
 * storefront renders and the Cloudinary identifiers the media library reconciles
 * against. Those are restored here - by URL from the product's own images first,
 * then from the Media documents - so saving a product for an unrelated reason can
 * never strip metadata that the request never mentioned (F-61).
 */
async function restoreImageMeta(stored: ProductImage[], incoming: IncomingImage[]): Promise<ProductImage[]> {
  const storedByUrl = new Map(stored.map((image) => [image.url, image]));
  const unknown = incoming.map((image) => image.url).filter((url) => !storedByUrl.has(url));

  const mediaByUrl = new Map<string, { key: string; alt?: string; id: Types.ObjectId }>();
  if (unknown.length) {
    const docs = await Media.find({ url: { $in: unknown } }).select('url key alt').lean();
    for (const doc of docs) mediaByUrl.set(doc.url, { key: doc.key, alt: doc.alt, id: doc._id });
  }

  return incoming.map((image, index) => {
    const known = storedByUrl.get(image.url);
    const media = mediaByUrl.get(image.url);
    return {
      url: image.url,
      order: image.order ?? index + 1,
      alt: image.alt || known?.alt || media?.alt,
      publicId: known?.publicId ?? media?.key,
      mediaId: known?.mediaId ?? media?.id,
    };
  });
}

export const listProducts = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit } = parsePaging(req.query);
  const q = req.query as Record<string, string | undefined>;

  const result = await findProducts({
    page,
    limit,
    search: q.q,
    includeInactive: true,
    sort: (q.sort as SortOption) ?? 'newest',
  });

  return paginated(res, result);
});

export const getProduct = asyncHandler(async (req: Request, res: Response) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw ApiError.notFound('Product not found');
  return ok(res, product);
});

async function resolveCategoryPath(categoryId: string) {
  const category = await Category.findById(categoryId);
  if (!category) throw ApiError.badRequest('Category does not exist', { category: ['does not exist'] });
  return [...category.ancestors, category._id];
}

export const createProduct = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body;
  const slug = body.slug || (await uniqueSlug(pickLocale(body.name), async (c) => Boolean(await Product.exists({ slug: c }))));

  const product = await Product.create({
    ...body,
    slug,
    sku: body.sku || generateSku(),
    categoryPath: await resolveCategoryPath(body.category),
    thumbnail: body.thumbnail ?? body.images?.[0]?.url,
  });

  await Category.updateOne({ _id: body.category }, { $inc: { productCount: 1 } });
  revalidateStorefront(product.slug);
  return created(res, product);
});

export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw ApiError.notFound('Product not found');

  const body: Record<string, unknown> = { ...req.body };

  if (body.category && String(body.category) !== String(product.category)) {
    body.categoryPath = await resolveCategoryPath(String(body.category));
    await Category.updateOne({ _id: product.category }, { $inc: { productCount: -1 } });
    await Category.updateOne({ _id: body.category }, { $inc: { productCount: 1 } });
  }

  if (Array.isArray(body.images)) {
    body.images = await restoreImageMeta(product.images, body.images as IncomingImage[]);
    if (!('thumbnail' in body)) body.thumbnail = (body.images as ProductImage[])[0]?.url ?? null;
  }

  const updated = await Product.findByIdAndUpdate(req.params.id, toMongoUpdate(body), {
    new: true,
    runValidators: true,
  });
  if (!updated) throw ApiError.notFound('Product not found');
  revalidateStorefront(updated.slug);
  return ok(res, updated);
});

export const deleteProduct = asyncHandler(async (req: Request, res: Response) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw ApiError.notFound('Product not found');

  /**
   * Historical orders resolve their lines through the product reference, so the
   * document has to stay while any order still points at it - exactly the guard
   * categories already enforce against their own relations (F-65).
   */
  if (await Order.exists({ 'items.product': product._id })) {
    throw ApiError.badRequest('This product appears in existing orders - deactivate it instead of deleting it');
  }

  await Collection.updateMany({}, { $pull: { products: product._id } });
  await Category.updateOne({ _id: product.category }, { $inc: { productCount: -1 } });
  await product.deleteOne();
  revalidateStorefront(product.slug);
  return noContent(res);
});

/* ---------------------------- categories ---------------------------- */

export const listCategories = asyncHandler(async (_req: Request, res: Response) => {
  const items = await Category.find().sort({ depth: 1, order: 1 }).lean();
  return ok(res, items);
});

export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body;
  let ancestors: unknown[] = [];
  let depth = 0;

  if (body.parent) {
    const parent = await Category.findById(body.parent);
    if (!parent) throw ApiError.badRequest('Parent category does not exist');
    ancestors = [...parent.ancestors, parent._id];
    depth = parent.depth + 1;
  }

  const slug = body.slug || (await uniqueSlug(pickLocale(body.name), async (c) => Boolean(await Category.exists({ slug: c }))));
  const category = await Category.create({ ...body, slug, ancestors, depth });
  return created(res, category);
});

/**
 * Descendants keep absolute ancestors/depth copies and products snapshot the full
 * categoryPath, so moving a category must rewrite all three. Absolute values make a
 * partial run idempotent, and the moved node itself is patched by the caller only
 * after this cascade, so a failed move is still detected and re-run on retry.
 */
async function cascadeCategoryMove(category: CategoryDocument, ancestors: Types.ObjectId[]) {
  const descendants = await Category.find({ ancestors: category._id });
  const basePath = [...ancestors, category._id];

  const moves: Array<{ id: Types.ObjectId; path: Types.ObjectId[] }> = [{ id: category._id, path: basePath }];
  const descendantOps = [];
  for (const descendant of descendants) {
    const index = descendant.ancestors.findIndex((id) => String(id) === String(category._id));
    const path = [...basePath, ...descendant.ancestors.slice(index + 1)];
    moves.push({ id: descendant._id, path });
    descendantOps.push({
      updateOne: { filter: { _id: descendant._id }, update: { $set: { ancestors: path, depth: path.length } } },
    });
  }

  if (descendantOps.length) await Category.bulkWrite(descendantOps);
  await Product.bulkWrite(
    moves.map((move) => ({
      updateMany: { filter: { category: move.id }, update: { $set: { categoryPath: move.path } } },
    })),
  );
}

export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
  const category = await Category.findById(req.params.id);
  if (!category) throw ApiError.notFound('Category not found');

  const patch: Record<string, unknown> = { ...req.body };

  if ('parent' in req.body) {
    const newParentId = req.body.parent ? String(req.body.parent) : null;
    const currentParentId = category.parent ? String(category.parent) : null;

    if (newParentId !== currentParentId) {
      let ancestors: Types.ObjectId[] = [];
      let depth = 0;

      if (newParentId) {
        if (newParentId === String(category._id)) throw ApiError.badRequest('A category cannot be its own parent');
        const parent = await Category.findById(newParentId);
        if (!parent) throw ApiError.badRequest('Parent category does not exist');
        if (parent.ancestors.some((id) => String(id) === String(category._id))) {
          throw ApiError.badRequest('A category cannot be moved under its own descendant');
        }
        ancestors = [...parent.ancestors, parent._id];
        depth = parent.depth + 1;
      }

      patch.ancestors = ancestors;
      patch.depth = depth;
      await cascadeCategoryMove(category, ancestors);
    }
  }

  const updated = await Category.findByIdAndUpdate(req.params.id, toMongoUpdate(patch, ['parent']), {
    new: true,
    runValidators: true,
  });
  if (!updated) throw ApiError.notFound('Category not found');
  return ok(res, updated);
});

export const deleteCategory = asyncHandler(async (req: Request, res: Response) => {
  const hasChildren = await Category.exists({ parent: req.params.id });
  if (hasChildren) throw ApiError.badRequest('Remove or move the sub-categories first');

  const hasProducts = await Product.exists({ category: req.params.id });
  if (hasProducts) throw ApiError.badRequest('This category still contains products');

  const category = await Category.findByIdAndDelete(req.params.id);
  if (!category) throw ApiError.notFound('Category not found');
  return noContent(res);
});

/* ---------------------------- collections --------------------------- */

export const listCollections = asyncHandler(async (_req: Request, res: Response) => {
  const items = await Collection.find().sort({ order: 1, _id: 1 }).lean();
  return ok(res, items);
});

export const createCollection = asyncHandler(async (req: Request, res: Response) => {
  const slug = req.body.slug || (await uniqueSlug(pickLocale(req.body.title), async (c) => Boolean(await Collection.exists({ slug: c }))));
  const collection = await Collection.create({ ...req.body, slug });
  return created(res, collection);
});

export const updateCollection = asyncHandler(async (req: Request, res: Response) => {
  const collection = await Collection.findByIdAndUpdate(req.params.id, toMongoUpdate(req.body), {
    new: true,
    runValidators: true,
  });
  if (!collection) throw ApiError.notFound('Collection not found');
  return ok(res, collection);
});

export const deleteCollection = asyncHandler(async (req: Request, res: Response) => {
  const collection = await Collection.findById(req.params.id);
  if (!collection) throw ApiError.notFound('Collection not found');

  /**
   * Storefront chrome links to collections by slug (hero slides, theme tiles, the
   * promo bar), so deleting one would leave a live 404 the admin cannot see from
   * this page. Same principle as the category and product guards (F-65).
   */
  const settings = await Setting.findOne({ key: 'storefront' }).lean();
  const links = [
    ...(settings?.heroSlides ?? []).map((slide) => slide.href ?? ''),
    ...(settings?.themeTiles ?? []).map((tile) => tile.href ?? ''),
    settings?.promoBar?.href ?? '',
  ];
  const linked = links.some((href) => href.includes(`/collections/${collection.slug}`));
  if (linked) throw ApiError.badRequest('The home page still links to this collection - remove the link first');

  await collection.deleteOne();
  return noContent(res);
});
