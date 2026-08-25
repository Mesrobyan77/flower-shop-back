/* eslint-disable no-console */
import { env } from '../config/env';
import { logger } from '../config/logger';
import {
  Address,
  Category,
  Collection,
  Inquiry,
  Order,
  Post,
  Product,
  Review,
  Setting,
  Subscription,
  SubscriptionPlan,
  User,
  Cart,
} from '../models';
import { generateSku } from '../utils/codes';
import { seedCategories, seedCollections } from './data/categories';
import { seedPosts, seedPlans, seedSettings } from './data/content';
import { candyAddon, chocolateAddon, commonOptionGroups, seedProducts, sizeOption } from './data/products';
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

async function wipe() {
  logger.warn('Dropping existing collections (--fresh)');
  await Promise.all([
    Address.deleteMany({}),
    Cart.deleteMany({}),
    Category.deleteMany({}),
    Collection.deleteMany({}),
    Inquiry.deleteMany({}),
    Order.deleteMany({}),
    Post.deleteMany({}),
    Product.deleteMany({}),
    Review.deleteMany({}),
    Setting.deleteMany({}),
    Subscription.deleteMany({}),
    SubscriptionPlan.deleteMany({}),
    User.deleteMany({}),
  ]);
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
      name: 'Anahit Flower Design Admin',
      phone: '+374 10 500 700',
      role: 'admin',
    });
    logger.info(`Admin created: ${env.SEED_ADMIN_EMAIL} / ${env.SEED_ADMIN_PASSWORD}`);
  }

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
    logger.info(`Demo customer created: ${demoEmail} / Demo1234`);
  }
}

async function seedCategoryTree() {
  const byCode = new Map<string, { id: unknown; ancestors: unknown[]; depth: number }>();

  const sorted = [...seedCategories].sort((a, b) => a.code.length - b.code.length);

  for (const item of sorted) {
    const parent = item.parentCode ? byCode.get(item.parentCode) : undefined;
    const ancestors = parent ? [...parent.ancestors, parent.id] : [];
    const depth = parent ? parent.depth + 1 : 0;

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
        image: `/images/seed/cat-${item.slug}.${env.SEED_IMAGE_EXT}`,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    byCode.set(item.code, { id: doc._id, ancestors, depth });
  }

  return byCode;
}

async function seedCatalog(categoryIds: Map<string, { id: unknown; ancestors: unknown[] }>) {
  const collectionMembers = new Map<string, unknown[]>();

  for (const item of seedProducts) {
    const category = categoryIds.get(item.categoryCode);
    if (!category) throw new Error(`Seed product ${item.slug} points at unknown category ${item.categoryCode}`);

    const methods: DeliveryMethod[] = item.deliveryMethods ?? ['quick', 'parcel', 'pickup'];

    const optionGroups: unknown[] = [deliveryGroup(methods), dateGroup, timeGroup, ...commonOptionGroups];
    if (item.withSize) optionGroups.push(sizeOption(`${item.price.toLocaleString('hy-AM')} ${env.CURRENCY_SYMBOL}`));
    if (item.withAddons) optionGroups.push(chocolateAddon, candyAddon);

    const images = [1, 2, 3].map((n) => ({
      url: `/images/seed/${item.image}${n === 1 ? '' : `-${n}`}.${env.SEED_IMAGE_EXT}`,
      alt: item.name.hy,
      order: n,
    }));

    const doc = await Product.findOneAndUpdate(
      { slug: item.slug },
      {
        slug: item.slug,
        sku: generateSku(),
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
    await Collection.findOneAndUpdate(
      { slug: item.slug },
      {
        slug: item.slug,
        title: item.title,
        subtitle: item.subtitle,
        coverImage: `/images/seed/collection-${item.slug}.${env.SEED_IMAGE_EXT}`,
        bannerImage: item.bannerImage
          ? `/images/seed/${item.bannerImage}.${env.SEED_IMAGE_EXT}`
          : undefined,
        products: collectionMembers.get(item.slug) ?? [],
        order: item.order,
        showOnHome: item.showOnHome,
        isActive: true,
      },
      { upsert: true, setDefaultsOnInsert: true },
    );
  }
}

async function seedContent() {
  for (const post of seedPosts) {
    await Post.findOneAndUpdate(
      { slug: post.slug },
      { ...post, isPublished: true, publishedAt: new Date() },
      { upsert: true, setDefaultsOnInsert: true },
    );
  }

  for (const plan of seedPlans) {
    await SubscriptionPlan.findOneAndUpdate(
      { slug: plan.slug },
      { ...plan, isActive: true },
      { upsert: true, setDefaultsOnInsert: true },
    );
  }

  await Setting.findOneAndUpdate({ key: 'storefront' }, seedSettings, { upsert: true, setDefaultsOnInsert: true });
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

export interface SeedOptions {
  fresh?: boolean;
}

/** Idempotent: safe to run repeatedly. Passing fresh:true drops existing documents first. */
export async function runSeed(options: SeedOptions = {}) {
  if (options.fresh) await wipe();

  await seedUsers();
  const categoryIds = await seedCategoryTree();
  await seedCatalog(categoryIds as never);
  await seedContent();
  await seedReviews();
  await refreshCategoryCounts();

  const [categories, products, collections, posts, plans] = await Promise.all([
    Category.countDocuments(),
    Product.countDocuments(),
    Collection.countDocuments(),
    Post.countDocuments(),
    SubscriptionPlan.countDocuments(),
  ]);

  logger.info('Seed complete', { categories, products, collections, posts, plans });
  return { categories, products, collections, posts, plans };
}
