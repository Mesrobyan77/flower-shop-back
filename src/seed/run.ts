/* eslint-disable no-console */
import mongoose, { type Model } from 'mongoose';
import { env } from '../config/env';
import { logger } from '../config/logger';
import {
  Address,
  Cart,
  Category,
  Collection,
  Inquiry,
  Media,
  Order,
  Payment,
  Post,
  Product,
  RefreshSession,
  Review,
  Setting,
  Subscription,
  SubscriptionPlan,
  User,
} from '../models';
import { skuFromSlug } from '../utils/codes';
import { seedCategories, seedCollections } from './data/categories';
import { seedPosts, seedPlans, seedSettings } from './data/content';
import { candyAddon, chocolateAddon, commonOptionGroups, seedProducts, sizeOption, type SeedProduct } from './data/products';
import { tfSeedProducts } from './data/tf-products';
import { createSeedAssets, isOurCloudinaryUrl, type SeedAssets } from './photos';
import type { ProductImage } from '../models/Product';
import type { DeliveryMethod } from '../constants';

const deliveryGroup = (methods: DeliveryMethod[]) => ({
  key: 'delivery_method',
  label: { hy: 'Առաքման եղանակ', en: 'Delivery method', ru: 'Способ доставки' },
  type: 'select' as const,
  required: true,
  order: 0,
  options: [
    {
      key: 'quick',
      label: {
        hy: 'Էքսպրես (Երևան, նույն օրը, ժամի ընտրությամբ)',
        en: 'Express (Yerevan, same day, choose a time)',
        ru: 'Экспресс (Ереван, в тот же день, с выбором времени)',
      },
      priceDelta: 0,
      isAvailable: methods.includes('quick'),
      order: 1,
    },
    {
      key: 'parcel',
      label: {
        hy: 'Առաքում ողջ Հայաստանում (հաջորդ օրը)',
        en: 'Nationwide parcel (next day)',
        ru: 'Доставка по Армении (на следующий день)',
      },
      priceDelta: 0,
      isAvailable: methods.includes('parcel'),
      order: 2,
    },
    {
      key: 'pickup',
      label: { hy: 'Վերցնել ստուդիայից', en: 'Pick up at the studio', ru: 'Самовывоз из студии' },
      priceDelta: 0,
      isAvailable: methods.includes('pickup'),
      order: 3,
    },
  ].filter((o) => o.isAvailable),
});

const dateGroup = {
  key: 'delivery_date',
  label: { hy: 'Ցանկալի առաքման օր', en: 'Desired delivery date', ru: 'Желаемая дата доставки' },
  type: 'date' as const,
  required: true,
  order: 1,
  options: [],
};

const timeGroup = {
  key: 'delivery_time',
  label: { hy: 'Ցանկալի ժամ', en: 'Preferred time', ru: 'Желаемое время' },
  helpText: {
    hy: 'Ժամի ընտրությունը հասանելի է միայն էքսպրես առաքման դեպքում',
    en: 'Time selection is available for express delivery only',
    ru: 'Выбор времени доступен только для экспресс-доставки',
  },
  type: 'time' as const,
  required: false,
  order: 2,
  options: [],
};

const ALL_MODELS = [
  Address,
  Cart,
  Category,
  Collection,
  Inquiry,
  Media,
  Order,
  Payment,
  Post,
  Product,
  RefreshSession,
  Review,
  Setting,
  Subscription,
  SubscriptionPlan,
  User,
];

async function wipe() {
  // Fail closed at the lowest level too: no code path may drop a production DB.
  if (env.isProd) {
    throw new Error('Refusing to drop the database in production.');
  }
  logger.warn('Dropping the development database (SEED_RESET)');
  await mongoose.connection.dropDatabase();
  // The drop takes the indexes with it; rebuild them for every model.
  await Promise.all(ALL_MODELS.map((model) => model.syncIndexes()));
}

async function seedUsers() {
  const admin = await User.findOneAndUpdate(
    { email: env.SEED_ADMIN_EMAIL },
    {},
    { new: true, upsert: false },
  );

  if (!admin) {
    await User.create({
      email: env.SEED_ADMIN_EMAIL,
      password: env.SEED_ADMIN_PASSWORD,
      name: 'AURELIA Admin',
      phone: '+374 10 500 700',
      role: 'admin',
    });
    // The password is a credential, never a log line - not even in development.
    logger.info('Admin created', { email: env.SEED_ADMIN_EMAIL });
  }

  // The demo customer ships with a published password, so a production database
  // must never receive the account at all: seeded reviews skip when the fixture
  // is absent (see seedReviews).
  if (!env.isProd) {
    const demoEmail = 'demo@anahit-flower.am';
    if (!(await User.exists({ email: demoEmail }))) {
      await User.create({
        email: demoEmail,
        password: 'Demo1234',
        name: 'Անի Հակոբյան',
        phone: '+374 99 123 456',
        role: 'user',
        points: 2000,
        totalSpend: 120_000,
        grade: 'sprout',
      });
      logger.info('Demo customer created', { email: demoEmail });
    }
  }
}

async function seedCategoryTree(assets: SeedAssets) {
  const byCode = new Map<string, { id: unknown; ancestors: unknown[]; depth: number }>();

  const sorted = [...seedCategories].sort((a, b) => a.code.length - b.code.length);

  for (const item of sorted) {
    const parent = item.parentCode ? byCode.get(item.parentCode) : undefined;
    const ancestors = parent ? [...parent.ancestors, parent.id] : [];
    const depth = parent ? parent.depth + 1 : 0;
    const image = (await assets.resolve(`cat-${item.slug}`)).url;

    const doc = await Category.findOneAndUpdate(
      { code: item.code },
      {
        code: item.code,
        slug: item.slug,
        name: item.name,
        parent: parent?.id ?? null,
        ancestors,
        depth,
        order: item.order,
        icon: item.icon,
        isActive: true,
        showInNav: item.showInNav ?? depth === 0,
        image,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    byCode.set(item.code, { id: doc._id, ancestors, depth });
  }

  return byCode;
}

/** Every image that could not be imported from its source page; reported at the end of the run. */
const imageFailures: { product: string; source: string; error: string }[] = [];

/**
 * Imported products try their own source-page images first: download ->
 * temporary buffer -> our Cloudinary -> Media. A product whose images all fail
 * falls back to the documented Pexels pipeline; a product with some successes
 * keeps only those, so a gallery never mixes source images with fallback art.
 */
async function resolveProductImages(item: SeedProduct, assets: SeedAssets): Promise<ProductImage[]> {
  if (item.source && assets.live) {
    const images: ProductImage[] = [];
    for (const path of item.source.images) {
      try {
        const resolved = await assets.resolveTf({
          tfSlug: item.source.tfSlug,
          productUrl: item.source.productUrl,
          path,
        });
        images.push({
          url: resolved.url,
          alt: item.name.hy,
          order: images.length + 1,
          publicId: resolved.publicId,
          mediaId: resolved.mediaId,
        });
      } catch (err) {
        imageFailures.push({ product: item.slug, source: path, error: (err as Error).message });
        logger.warn('Seed image import failed', { product: item.slug, source: path, error: (err as Error).message });
      }
    }
    if (images.length > 0) return images;
    imageFailures.push({
      product: item.slug,
      source: '(source page)',
      error: 'all source images failed - falling back to the Pexels pipeline',
    });
    logger.warn('Seed image: falling back to the Pexels pipeline for this product', { product: item.slug });
  }

  // Local artwork in fallback mode; Pexels -> Cloudinary -> Media in live mode.
  return Promise.all(
    [1, 2, 3].map(async (n) => {
      const resolved = await assets.resolve(`${item.image}${n === 1 ? '' : `-${n}`}`);
      return {
        url: resolved.url,
        alt: item.name.hy,
        order: n,
        publicId: resolved.publicId,
        mediaId: resolved.mediaId,
      };
    }),
  );
}

async function seedCatalog(
  categoryIds: Map<string, { id: unknown; ancestors: unknown[]; depth: number }>,
  assets: SeedAssets,
) {
  const collectionMembers = new Map<string, unknown[]>();

  for (const item of [...seedProducts, ...tfSeedProducts]) {
    const category = categoryIds.get(item.categoryCode);
    if (!category) throw new Error(`Seed product ${item.slug} points at unknown category ${item.categoryCode}`);

    const methods: DeliveryMethod[] = item.deliveryMethods ?? ['quick', 'parcel', 'pickup'];

    const optionGroups: unknown[] = [deliveryGroup(methods), dateGroup, timeGroup, ...commonOptionGroups];
    if (item.withSize) optionGroups.push(sizeOption(`${item.price.toLocaleString('hy-AM')} ${env.CURRENCY_SYMBOL}`));
    if (item.withAddons) optionGroups.push(chocolateAddon, candyAddon);

    // Imported products first try their own source-page images; everything
    // else goes through the documented Pexels -> Cloudinary -> Media pipeline.
    const images = await resolveProductImages(item, assets);

    const doc = await Product.findOneAndUpdate(
      { slug: item.slug },
      {
        slug: item.slug,
        sku: skuFromSlug(item.slug),
        name: item.name,
        shortDescription: item.shortDescription,
        description: {
          hy: `${item.shortDescription.hy}. Ամեն ձևավորում պատրաստվում է պատվերից հետո՝ թարմ ծաղիկներից։`,
          en: `${item.shortDescription.en}. Every arrangement is made to order from fresh stems.`,
          ru: `${item.shortDescription.ru}. Каждая композиция собирается после заказа из свежих цветов.`,
        },
        careGuide: {
          hy: 'Փոխեք ջուրը ամեն օր, ցողունները կտրեք 45 աստիճանով, հեռու պահեք ուղիղ արևից։',
          en: 'Change the water daily, trim the stems at 45 degrees, keep away from direct sun.',
          ru: 'Меняйте воду ежедневно, подрезайте стебли под 45 градусов, берегите от прямого солнца.',
        },
        category: category.id,
        categoryPath: [...category.ancestors, category.id],
        price: item.price,
        compareAtPrice: item.compareAtPrice,
        images,
        thumbnail: images[0].url,
        optionGroups,
        deliveryMethods: methods,
        badges: item.badges ?? [],
        origin: { hy: 'Հայաստան / ներմուծված', en: 'Armenia / imported', ru: 'Армения / импорт' },
        stock: 100,
        trackStock: false,
        isActive: true,
        isFeatured: item.isFeatured ?? false,
        sameDayAvailable: methods.includes('quick'),
        ratingAverage: item.rating ?? 0,
        ratingCount: item.reviews ?? 0,
        soldCount: item.sold ?? 0,
        publishedAt: new Date(),
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    for (const slug of item.collections ?? []) {
      const list = collectionMembers.get(slug) ?? [];
      list.push(doc._id);
      collectionMembers.set(slug, list);
    }
  }

  for (const item of seedCollections) {
    const coverImage = (await assets.resolve(`collection-${item.slug}`)).url;
    const bannerImage = item.bannerImage ? (await assets.resolve(item.bannerImage)).url : undefined;

    await Collection.findOneAndUpdate(
      { slug: item.slug },
      {
        slug: item.slug,
        title: item.title,
        subtitle: item.subtitle,
        coverImage,
        bannerImage,
        products: collectionMembers.get(item.slug) ?? [],
        order: item.order,
        showOnHome: item.showOnHome,
        isActive: true,
      },
      { upsert: true, setDefaultsOnInsert: true },
    );
  }
}

async function seedContent(assets: SeedAssets) {
  for (const post of seedPosts) {
    const coverImage = post.coverImage ? (await assets.resolve(post.coverImage)).url : undefined;
    await Post.findOneAndUpdate(
      { slug: post.slug },
      { ...post, coverImage, isPublished: true, publishedAt: new Date() },
      { upsert: true, setDefaultsOnInsert: true },
    );
  }

  for (const plan of seedPlans) {
    const image = (await assets.resolve(plan.image)).url;
    await SubscriptionPlan.findOneAndUpdate(
      { slug: plan.slug },
      { ...plan, image, isActive: true },
      { upsert: true, setDefaultsOnInsert: true },
    );
  }

  const heroSlides = await Promise.all(
    seedSettings.heroSlides.map(async (slide) => ({
      ...slide,
      image: (await assets.resolve(slide.image)).url,
    })),
  );
  const themeTiles = await Promise.all(
    seedSettings.themeTiles.map(async (tile) => ({
      ...tile,
      image: tile.image ? (await assets.resolve(tile.image)).url : undefined,
    })),
  );

  await Setting.findOneAndUpdate(
    { key: 'storefront' },
    { ...seedSettings, heroSlides, themeTiles },
    { upsert: true, setDefaultsOnInsert: true },
  );
}

async function seedReviews() {
  const demo = await User.findOne({ email: 'demo@anahit-flower.am' });
  if (!demo) return;

  const products = await Product.find({ ratingCount: { $gt: 0 } }).limit(8);
  const bodies = [
    {
      rating: 5,
      body: {
        hy: 'Ծաղիկները հասան ժամանակին և շատ թարմ էին։ Ստացողը հիացած էր։',
        en: 'The flowers arrived on time and were beautifully fresh. The recipient loved them.',
        ru: 'Цветы приехали вовремя и были очень свежие. Получательница в восторге.',
      },
    },
    {
      rating: 5,
      body: {
        hy: 'Ձևավորումը նույնիսկ ավելի գեղեցիկ էր, քան նկարում։',
        en: 'The arrangement looked even better than in the photo.',
        ru: 'Композиция оказалась даже красивее, чем на фото.',
      },
    },
    {
      rating: 4,
      body: {
        hy: 'Ամեն ինչ լավ էր, առաքումը մի փոքր ուշացավ, բայց զանգահարեցին ու տեղեկացրին։',
        en: 'All good. Delivery ran slightly late but they called ahead to let me know.',
        ru: 'Всё хорошо. Доставка немного задержалась, но меня предупредили звонком.',
      },
    },
  ];

  for (const [index, product] of products.entries()) {
    const sample = bodies[index % bodies.length];
    await Review.findOneAndUpdate(
      { product: product._id, user: demo._id },
      {
        product: product._id,
        user: demo._id,
        rating: sample.rating,
        body: sample.body.hy,
        isVerified: true,
        isApproved: true,
      },
      { upsert: true, setDefaultsOnInsert: true },
    );
  }
}

/** Recomputes counts from the catalogue so repeated seeding stays accurate. */
async function refreshCategoryCounts() {
  const rows = await Product.aggregate<{ _id: unknown; count: number }>([
    { $match: { isActive: true } },
    { $unwind: '$categoryPath' },
    { $group: { _id: '$categoryPath', count: { $sum: 1 } } },
  ]);

  await Category.updateMany({}, { $set: { productCount: 0 } });
  for (const row of rows) {
    await Category.updateOne({ _id: row._id as never }, { $set: { productCount: row.count } });
  }
}

/* -------------------------------------------------------------------------- */
/* post-seed verification                                                      */
/* -------------------------------------------------------------------------- */

/** A displayed image URL that still points at a download source must fail the seed. */
const PEXELS_URL = /images\.pexels\.com/;
const THANKSFLOWERS_URL = /thanksflowers\.am/i;

export interface SeedReport {
  categories: number;
  products: number;
  collections: number;
  posts: number;
  plans: number;
  media: number;
  imageFailures: number;
}

async function findDuplicateSlug<T extends { slug: string }>(model: Model<T>): Promise<string | null> {
  const rows = await model.aggregate<{ _id: string; count: number }>([
    { $group: { _id: '$slug', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 1 },
  ]);
  return rows[0]?._id ?? null;
}

/**
 * Everything the storefront can render as an image ends up in one list, then:
 *  - no displayed URL may point at Pexels (it is a download source, not a CDN);
 *  - in live mode every displayed URL must be one of our Cloudinary copies;
 *  - every product mediaId must resolve to a Media row;
 *  - a sample of URLs must actually answer over HTTPS.
 */
async function verifySeed(assets: SeedAssets): Promise<SeedReport> {
  const [products, categories, collections, posts, plans, storefront] = await Promise.all([
    Product.find({}, { slug: 1, images: 1, thumbnail: 1 }),
    Category.find({}, { slug: 1, image: 1 }),
    Collection.find({}, { slug: 1, coverImage: 1, bannerImage: 1 }),
    Post.find({}, { slug: 1, coverImage: 1 }),
    SubscriptionPlan.find({}, { slug: 1, image: 1 }),
    Setting.findOne({ key: 'storefront' }),
  ]);

  const display: { where: string; url: string }[] = [];
  for (const product of products) {
    for (const [index, image] of product.images.entries()) {
      display.push({ where: `Product(${product.slug}).images[${index}]`, url: image.url });
    }
    if (product.thumbnail) display.push({ where: `Product(${product.slug}).thumbnail`, url: product.thumbnail });
  }
  for (const category of categories) {
    if (category.image) display.push({ where: `Category(${category.slug}).image`, url: category.image });
  }
  for (const collection of collections) {
    if (collection.coverImage) display.push({ where: `Collection(${collection.slug}).coverImage`, url: collection.coverImage });
    if (collection.bannerImage) display.push({ where: `Collection(${collection.slug}).bannerImage`, url: collection.bannerImage });
  }
  for (const post of posts) {
    if (post.coverImage) display.push({ where: `Post(${post.slug}).coverImage`, url: post.coverImage });
  }
  for (const plan of plans) {
    if (plan.image) display.push({ where: `SubscriptionPlan(${plan.slug}).image`, url: plan.image });
  }
  for (const [index, slide] of (storefront?.heroSlides ?? []).entries()) {
    display.push({ where: `Setting.heroSlides[${index}].image`, url: slide.image });
    if (slide.mobileImage) display.push({ where: `Setting.heroSlides[${index}].mobileImage`, url: slide.mobileImage });
  }
  for (const [index, tile] of (storefront?.themeTiles ?? []).entries()) {
    if (tile.image) display.push({ where: `Setting.themeTiles[${index}].image`, url: tile.image });
  }

  const pexels = display.filter((entry) => PEXELS_URL.test(entry.url));
  if (pexels.length > 0) {
    throw new Error(
      `Seed verification failed: ${pexels.length} displayed image URL(s) still point at Pexels ` +
        `(e.g. ${pexels[0].where} -> ${pexels[0].url}). Pexels is a download source; only our Cloudinary copy may be rendered.`,
    );
  }

  const thanksflowers = display.filter((entry) => THANKSFLOWERS_URL.test(entry.url));
  if (thanksflowers.length > 0) {
    throw new Error(
      `Seed verification failed: ${thanksflowers.length} displayed image URL(s) still point at ThanksFlowers ` +
        `(e.g. ${thanksflowers[0].where} -> ${thanksflowers[0].url}). The source page is a download source; only our Cloudinary copy may be rendered.`,
    );
  }

  const imageless = products.find((product) => product.images.length === 0 || !product.thumbnail);
  if (imageless) {
    throw new Error(`Seed verification failed: product "${imageless.slug}" has no images.`);
  }

  if (assets.live) {
    const offOrigin = display.filter((entry) => !isOurCloudinaryUrl(entry.url));
    if (offOrigin.length > 0) {
      throw new Error(
        `Seed verification failed: ${offOrigin.length} displayed image URL(s) are not our Cloudinary delivery URLs ` +
          `(e.g. ${offOrigin[0].where} -> ${offOrigin[0].url}).`,
      );
    }
  }

  const mediaRows = await Media.find({}, { key: 1, url: 1 });
  const mediaLeak = mediaRows.find((media) => PEXELS_URL.test(media.url));
  if (mediaLeak) {
    throw new Error(`Seed verification failed: Media(${mediaLeak.key}).url points at Pexels.`);
  }
  const tfMediaLeak = mediaRows.find((media) => THANKSFLOWERS_URL.test(media.url));
  if (tfMediaLeak) {
    throw new Error(`Seed verification failed: Media(${tfMediaLeak.key}).url points at ThanksFlowers.`);
  }

  if (assets.live) {
    const referenced = new Map<string, mongoose.Types.ObjectId>();
    for (const product of products) {
      for (const image of product.images) {
        if (image.mediaId) referenced.set(image.mediaId.toHexString(), image.mediaId);
      }
    }
    if (referenced.size === 0) {
      throw new Error('Seed verification failed: live mode produced no Media-backed product images.');
    }
    const found = await Media.countDocuments({ _id: { $in: [...referenced.values()] } });
    if (found !== referenced.size) {
      throw new Error(
        `Seed verification failed: ${referenced.size - found} product image mediaId(s) reference a missing Media row.`,
      );
    }
  }

  const categoryIds = await Category.distinct('_id');
  const strayProducts = await Product.countDocuments({ category: { $nin: categoryIds } });
  if (strayProducts > 0) {
    throw new Error(`Seed verification failed: ${strayProducts} product(s) reference a missing category.`);
  }
  const productIds = await Product.distinct('_id');
  const strayCollections = await Collection.countDocuments({ products: { $elemMatch: { $nin: productIds } } });
  if (strayCollections > 0) {
    throw new Error(`Seed verification failed: ${strayCollections} collection(s) reference a missing product.`);
  }

  const duplicate = (
    await Promise.all([
      findDuplicateSlug(Product).then((slug) => ({ kind: 'product', slug })),
      findDuplicateSlug(Category).then((slug) => ({ kind: 'category', slug })),
      findDuplicateSlug(Collection).then((slug) => ({ kind: 'collection', slug })),
      findDuplicateSlug(Post).then((slug) => ({ kind: 'post', slug })),
    ])
  ).find((pair) => pair.slug);
  if (duplicate) {
    throw new Error(`Seed verification failed: duplicate ${duplicate.kind} slug "${duplicate.slug}".`);
  }

  if (assets.live) {
    const magazine = await Post.findOne({ type: 'magazine' }).sort({ createdAt: 1 });
    const first = products[0];
    const last = products[products.length - 1];
    const probes: { where: string; url: string | undefined }[] = [
      { where: 'Setting.heroSlides[0].image', url: storefront?.heroSlides?.[0]?.image },
      { where: `Product(${first?.slug ?? '?'}).images[0]`, url: first?.images?.[0]?.url },
      { where: `Product(${first?.slug ?? '?'}).images[1]`, url: first?.images?.[1]?.url },
      { where: `Product(${last?.slug ?? '?'}).images[2]`, url: last?.images?.[2]?.url },
      { where: `Post(${magazine?.slug ?? '?'}).coverImage`, url: magazine?.coverImage },
    ];
    const reachable = await Promise.all(
      probes
        .filter((probe): probe is { where: string; url: string } => Boolean(probe.url))
        .map(async (probe) => ({ probe, ok: await assets.verifyUrl(probe.url) })),
    );
    const broken = reachable.filter((entry) => !entry.ok);
    if (broken.length > 0) {
      throw new Error(
        `Seed verification failed: ${broken.length} image URL(s) are not reachable ` +
          `(e.g. ${broken[0].probe.where} -> ${broken[0].probe.url}).`,
      );
    }
  }

  return {
    categories: categories.length,
    products: products.length,
    collections: collections.length,
    posts: posts.length,
    plans: plans.length,
    media: mediaRows.length,
    imageFailures: imageFailures.length,
  };
}

export interface SeedOptions {
  fresh?: boolean;
  /**
   * The destructive path (SEED_RESET=true) must be acknowledged explicitly;
   * production is refused outright, with or without the acknowledgement.
   */
  confirmDestructive?: boolean;
}

/** Idempotent: safe to run repeatedly. Passing fresh:true drops the database first. */
export async function runSeed(options: SeedOptions = {}) {
  imageFailures.length = 0;
  if (options.fresh) {
    /**
     * Fail closed: a destructive run needs both the SEED_RESET signal and a
     * non-production NODE_ENV, so no stale script or muscle-memory command can
     * empty a live shop.
     */
    if (env.isProd) {
      throw new Error('Refusing to reset: destructive seeding is disabled in production.');
    }
    if (!options.confirmDestructive) {
      throw new Error('Refusing to reset: SEED_RESET=true is required for a destructive run.');
    }
    await wipe();
  }

  const assets = createSeedAssets();
  await seedUsers();
  const categoryIds = await seedCategoryTree(assets);
  await seedCatalog(categoryIds, assets);
  await seedContent(assets);
  await seedReviews();
  await refreshCategoryCounts();
  const report = await verifySeed(assets);

  logger.info('Seed complete', {
    ...report,
    imageMode: assets.live ? 'thanksflowers+pexels->cloudinary' : 'local-fallback',
    ...assets.stats(),
  });
  return report;
}
