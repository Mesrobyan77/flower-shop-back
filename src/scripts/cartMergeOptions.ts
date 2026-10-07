/* eslint-disable no-console */
/**
 * Targeted regression for the two cart write findings:
 *
 *   F-44  adding a line that is identical to one already in the basket merges into
 *         that line (quantity adds up) instead of creating a twin; anything that
 *         makes the line different (delivery, dates, text, options) stays separate
 *   F-43  an option sent under a group key the product does not define is refused
 *         by name instead of being dropped silently
 *
 * Runs on its own in-memory MongoDB, never on the configured database, and calls
 * the service functions directly.
 *
 * Run: npx tsx src/scripts/cartMergeOptions.ts
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Types } from 'mongoose';

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
    return;
  }
  failed += 1;
  console.log(`  FAIL  ${label}`);
  if (detail !== undefined) console.log('        ', JSON.stringify(detail, null, 2)?.slice(0, 500));
}

const runTag = Date.now();
const localized = (hy: string, en: string, ru: string) => ({ hy, en, ru });

async function main() {
  const mongo = await MongoMemoryServer.create({
    instance: { storageEngine: 'wiredTiger', dbName: 'anahit_flower' },
  });
  process.env.MONGODB_URI = mongo.getUri();
  process.env.MONGODB_DB = 'anahit_flower';

  const { connectDatabase, disconnectDatabase } = await import('../config/db');
  const { addItem } = await import('../services/cart.service');
  const { Cart } = await import('../models/Cart');
  const { Product } = await import('../models/Product');

  await connectDatabase();
  const { env } = await import('../config/env');
  if (!env.MONGODB_URI.startsWith('mongodb://127.0.0.1') && !env.MONGODB_URI.startsWith('mongodb://[::1]')) {
    console.error(`Refusing to run: expected a loopback database, dialed ${env.MONGODB_URI}`);
    await disconnectDatabase();
    await mongo.stop();
    process.exit(1);
  }

  const owner = { sessionId: `merge-${runTag}` };

  async function lines() {
    const cart = await Cart.findOne(owner).lean();
    return (cart?.items ?? []) as { quantity: number; deliveryMethod: string; options: { groupKey: string }[] }[];
  }

  console.log('\nF-44 duplicate lines merge into one');
  const mergeable = await Product.create({
    sku: `MERGE-${runTag}`,
    slug: `merge-${runTag}`,
    name: localized('Միաձույմ', 'Merge', 'Слияние'),
    category: new Types.ObjectId(),
    price: 1000,
    deliveryMethods: ['parcel', 'quick'],
    stock: 10,
    trackStock: true,
    isActive: true,
    optionGroups: [
      {
        key: 'size',
        label: localized('Չափ', 'Size', 'Размер'),
        type: 'select',
        required: false,
        options: [
          { key: 's', label: localized('Փոքր', 'Small', 'Малый'), priceDelta: 0 },
          { key: 'l', label: localized('Մեծ', 'Large', 'Большой'), priceDelta: 500 },
        ],
      },
    ],
  });
  const base = { productId: String(mergeable._id), deliveryMethod: 'parcel' as const, quantity: 2 };

  await addItem(owner, { ...base, options: [{ groupKey: 'size', optionKey: 's' }] });
  await addItem(owner, { ...base, options: [{ groupKey: 'size', optionKey: 's' }] });
  let current = await lines();
  check('the identical second add did not create a twin', current.length === 1, current.length);
  check('the merged line carries the summed quantity', current[0]?.quantity === 4, current[0]?.quantity);

  await addItem(owner, { ...base, quantity: 1, options: [{ groupKey: 'size', optionKey: 'l' }] });
  current = await lines();
  check('a different option value stays its own line', current.length === 2, current.length);

  await addItem(owner, { ...base, quantity: 1, deliveryMethod: 'quick' });
  current = await lines();
  check('a different delivery method stays its own line', current.length === 3, current.length);

  await addItem(owner, { ...base, quantity: 1, ribbonText: 'Shushan' });
  const beforeRibbon = await lines();
  await addItem(owner, { ...base, quantity: 1, ribbonText: 'Karen' });
  current = await lines();
  check('different ribbon text does not merge', current.length === beforeRibbon.length + 1, current.length);

  console.log('\nF-44 merged demand is still bounded by the product rules');
  const capped = await Product.create({
    sku: `CAP-${runTag}`,
    slug: `cap-${runTag}`,
    name: localized('Առավելագույն', 'Cap', 'Лимит'),
    category: new Types.ObjectId(),
    price: 1000,
    deliveryMethods: ['parcel'],
    stock: 20,
    trackStock: true,
    maxOrderQty: 4,
    isActive: true,
  });
  await addItem(owner, { productId: String(capped._id), quantity: 3, deliveryMethod: 'parcel' });
  const capBefore = await lines();
  let refused = false;
  try {
    await addItem(owner, { productId: String(capped._id), quantity: 2, deliveryMethod: 'parcel' });
  } catch (err) {
    refused = true;
    check('the merged quantity above maxOrderQty is refused', (err as Error).message === 'Maximum quantity is 4', err);
  }
  check('the over-cap add did reach a refusal', refused);
  const capAfter = await lines();
  check(
    'the refused merge left the basket unchanged',
    capAfter.length === capBefore.length && capAfter.some((l) => l.quantity === 3) && !capAfter.some((l) => l.quantity === 5),
    capAfter.map((l) => l.quantity),
  );

  const scarce = await Product.create({
    sku: `SCARCE-${runTag}`,
    slug: `scarce-${runTag}`,
    name: localized('Պակաս', 'Scarce', 'Мало'),
    category: new Types.ObjectId(),
    price: 1000,
    deliveryMethods: ['parcel'],
    stock: 5,
    trackStock: true,
    isActive: true,
  });
  await addItem(owner, { productId: String(scarce._id), quantity: 4, deliveryMethod: 'parcel' });
  const scarceBefore = await lines();
  let stockRefused = false;
  try {
    await addItem(owner, { productId: String(scarce._id), quantity: 2, deliveryMethod: 'parcel' });
  } catch (err) {
    stockRefused = true;
    check('merged demand above stock is refused', (err as Error).message === 'Not enough stock available', err);
  }
  check('the merged add reached the stock refusal', stockRefused);
  const scarceAfter = await lines();
  check(
    'the refused stock merge left the basket unchanged',
    JSON.stringify(scarceAfter) === JSON.stringify(scarceBefore) && scarceAfter.some((l) => l.quantity === 4),
    scarceAfter.map((l) => l.quantity),
  );

  console.log('\nF-43 unknown option groups are refused, not dropped');
  const beforeOptions = await lines();
  let groupRefused = false;
  try {
    await addItem(owner, { ...base, quantity: 1, options: [{ groupKey: 'topping', optionKey: 'choco' }] });
  } catch (err) {
    groupRefused = true;
    check('the unknown group key is named in the refusal', /"topping" is not an option group/.test((err as Error).message), err);
  }
  check('an unknown option group reaches a refusal', groupRefused);
  check(
    'the refused option add added no line',
    (await lines()).length === beforeOptions.length,
    (await lines()).length,
  );

  let choiceRefused = false;
  try {
    await addItem(owner, { ...base, quantity: 1, options: [{ groupKey: 'size', optionKey: 'xl' }] });
  } catch (err) {
    choiceRefused = true;
    check('an unknown choice inside a known group is refused', /Invalid choice/.test((err as Error).message), err);
  }
  check('an unknown choice reaches a refusal', choiceRefused);
  check(
    'the refused choice added no line either',
    (await lines()).length === beforeOptions.length,
    (await lines()).length,
  );

  await addItem(owner, { ...base, quantity: 1, options: [{ groupKey: 'size', optionKey: 's' }] });
  const last = await Cart.findOne(owner).lean();
  const sizeLine = (last?.items ?? []).find((item) =>
    (item.options as { groupKey: string }[]).some((o) => o.groupKey === 'size'),
  );
  check('a valid group key is stored on the line', Boolean(sizeLine), last?.items?.length);

  await disconnectDatabase();
  await mongo.stop();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
