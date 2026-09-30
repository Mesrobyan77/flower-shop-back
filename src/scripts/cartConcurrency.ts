/* eslint-disable no-console */
/**
 * Cart ownership-uniqueness concurrency test (Checkpoint E6.1).
 *
 * Proves the P1-1 fix end to end - at most one cart per owner, enforced by the
 * partial unique indexes on `user` / `sessionId` and recovered by the narrow
 * E11000 retry in `getOrCreateCart`:
 *
 *   A. member first touch    20 concurrent getOrCreateCart for one user ->
 *                            20 successes, ONE cart _id, exactly 1 DB cart
 *   B. guest first touch     20 concurrent getOrCreateCart for one sessionId
 *                            -> same invariant
 *   C. owner isolation       different users / sessions get different carts;
 *                            guest and member ownership never collide; and
 *                            missing OR null ownership fields never collide
 *   D. regression            normal cart create/get/add/update/remove/clear
 *                            behaviour (member + guest) is unchanged
 *   E. index verification    `Cart.syncIndexes()` (the exact per-model step
 *                            `npm run db:indexes` runs) plus a raw
 *                            `collection.indexes()` dump proving `user_1` and
 *                            `sessionId_1` are UNIQUE and TYPE-PARTIAL, the
 *                            guest TTL index survived, and a behavioural
 *                            duplicate insert is refused with E11000
 *
 * Self-contained: it boots its own in-memory MongoDB on loopback BEFORE any app
 * module reads `config/env`, so the configured (Atlas) MONGODB_URI can never be
 * dialed from this process - no running API and no seed data required.
 *
 * Run: npm run cart:concurrency
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose, { Types } from 'mongoose';

const RUN_COUNT = 20;
const runTag = Date.now();

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
  if (detail !== undefined) console.log('        ', JSON.stringify(detail, null, 2)?.slice(0, 600));
}

function section(title: string) {
  console.log(`\n${title}`);
}

/** Raw insert that reports the server error instead of throwing. */
async function insertRaw(doc: Record<string, unknown>): Promise<{ code?: number; keyPattern?: unknown } | null> {
  try {
    await Cart.collection.insertOne(doc as never);
    return null;
  } catch (err) {
    return err as { code?: number; keyPattern?: unknown };
  }
}

let Cart!: (typeof import('../models/Cart'))['Cart'];
let User!: (typeof import('../models/User'))['User'];
let Product!: (typeof import('../models/Product'))['Product'];
let getOrCreateCart!: (typeof import('../services/cart.service'))['getOrCreateCart'];
let addItem!: (typeof import('../services/cart.service'))['addItem'];
let updateItem!: (typeof import('../services/cart.service'))['updateItem'];
let removeItem!: (typeof import('../services/cart.service'))['removeItem'];
let clearCart!: (typeof import('../services/cart.service'))['clearCart'];
let getCartView!: (typeof import('../services/cart.service'))['getCartView'];

async function main() {
  // 1. Loopback-only database, chosen before any app import so `config/env`
  //    picks it up instead of the Atlas URI from .env (dotenv never overrides
  //    pre-set variables).
  const mongo = await MongoMemoryServer.create({
    instance: { storageEngine: 'wiredTiger', dbName: 'anahit_flower' },
  });
  process.env.MONGODB_URI = mongo.getUri();
  process.env.MONGODB_DB = 'anahit_flower';

  const { connectDatabase, disconnectDatabase } = await import('../config/db');
  const cartService = await import('../services/cart.service');
  ({ Cart } = await import('../models/Cart'));
  ({ User } = await import('../models/User'));
  ({ Product } = await import('../models/Product'));
  ({ getOrCreateCart, addItem, updateItem, removeItem, clearCart, getCartView } = cartService);

  await connectDatabase();
  const { env } = await import('../config/env');
  const dialed = env.MONGODB_URI;
  if (!dialed.startsWith('mongodb://127.0.0.1') && !dialed.startsWith('mongodb://[::1]')) {
    console.error(`Refusing to run: expected a loopback database, dialed ${dialed}`);
    await disconnectDatabase();
    await mongo.stop();
    process.exit(1);
  }

  // 2. Deterministic index state: this is the exact per-model operation
  //    `npm run db:indexes` performs (Model.syncIndexes) before its checks.
  section('0. Index synchronization (db:indexes equivalent)');
  await Cart.syncIndexes();
  const declaredNames = (Cart.schema.indexes() as [Record<string, unknown>, Record<string, unknown>][]).map(
    ([keys, options]) =>
      (options.name as string | undefined) ??
      Object.entries(keys)
        .map(([path, direction]) => `${path}_${direction}`)
        .join('_'),
  );
  const presentNames = new Set((await Cart.listIndexes()).map((index) => index.name));
  for (const name of declaredNames) {
    check(`declared Cart index present after sync: ${name}`, presentNames.has(name), [...presentNames]);
  }

  // 3. Scenario A - member cart.
  section('A. Member cart - 20 concurrent first touches');
  const member = await User.create({
    email: `cart-e61-member-${runTag}@example.test`,
    password: 'Test1234!',
    name: 'E61 Member',
  });
  const memberOwner = { userId: String(member._id) };
  check('starts with no cart for that user', (await Cart.countDocuments({ user: member._id })) === 0);

  const memberResults = await Promise.allSettled(
    Array.from({ length: RUN_COUNT }, () => getOrCreateCart(memberOwner)),
  );
  const memberCarts = memberResults.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  check(
    `${RUN_COUNT}/${RUN_COUNT} concurrent member first touches succeed`,
    memberCarts.length === RUN_COUNT,
    memberResults
      .filter((r) => r.status === 'rejected')
      .map((r) => String((r as PromiseRejectedResult).reason?.message ?? (r as PromiseRejectedResult).reason)),
  );
  const memberIds = new Set(memberCarts.map((cart) => String(cart._id)));
  check('all member calls reference the SAME cart _id', memberIds.size === 1, [...memberIds]);
  const memberDbCount = await Cart.countDocuments({ user: member._id });
  check('database contains exactly ONE cart for that user', memberDbCount === 1, { memberDbCount });

  // 4. Scenario B - guest cart.
  section('B. Guest cart - 20 concurrent first touches');
  const guestSid = `cart-e61-guest-${runTag}`;
  check('starts with no cart for that session', (await Cart.countDocuments({ sessionId: guestSid })) === 0);

  const guestResults = await Promise.allSettled(
    Array.from({ length: RUN_COUNT }, () => getOrCreateCart({ sessionId: guestSid })),
  );
  const guestCarts = guestResults.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  check(
    `${RUN_COUNT}/${RUN_COUNT} concurrent guest first touches succeed`,
    guestCarts.length === RUN_COUNT,
    guestResults
      .filter((r) => r.status === 'rejected')
      .map((r) => String((r as PromiseRejectedResult).reason?.message ?? (r as PromiseRejectedResult).reason)),
  );
  const guestIds = new Set(guestCarts.map((cart) => String(cart._id)));
  check('all guest calls reference the SAME cart _id', guestIds.size === 1, [...guestIds]);
  const guestDbCount = await Cart.countDocuments({ sessionId: guestSid });
  check('database contains exactly ONE cart for that session', guestDbCount === 1, { guestDbCount });

  // 5. Scenario C - owner isolation.
  section('C. Owner isolation');
  const [userA, userB] = await Promise.all([
    User.create({ email: `cart-e61-a-${runTag}@example.test`, password: 'Test1234!', name: 'E61 A' }),
    User.create({ email: `cart-e61-b-${runTag}@example.test`, password: 'Test1234!', name: 'E61 B' }),
  ]);
  const sidX = `cart-e61-x-${runTag}`;
  const sidY = `cart-e61-y-${runTag}`;
  const cartA = await getOrCreateCart({ userId: String(userA._id) });
  const cartB = await getOrCreateCart({ userId: String(userB._id) });
  const cartX = await getOrCreateCart({ sessionId: sidX });
  const cartY = await getOrCreateCart({ sessionId: sidY });
  check(
    'different users and sessions get FOUR distinct carts',
    new Set([cartA, cartB, cartX, cartY].map(String)).size === 4,
  );
  check('exactly one cart for user A', (await Cart.countDocuments({ user: userA._id })) === 1);
  check('exactly one cart for user B', (await Cart.countDocuments({ user: userB._id })) === 1);
  check('exactly one cart for session X', (await Cart.countDocuments({ sessionId: sidX })) === 1);
  check('exactly one cart for session Y', (await Cart.countDocuments({ sessionId: sidY })) === 1);

  const docA = await Cart.findById(cartA._id).lean();
  const docX = await Cart.findById(cartX._id).lean();
  check('member cart carries no sessionId', docA?.sessionId === undefined, docA?.sessionId);
  check('guest cart carries no user', docX?.user === undefined, docX?.user);

  // A guest session whose id literally equals a member's user id must still be
  // its own cart - ownership modes are independent key patterns, not coupled.
  const crossSid = String(userA._id);
  const crossCart = await getOrCreateCart({ sessionId: crossSid });
  check('guest session equal to a member user id yields its OWN cart', String(crossCart._id) !== String(cartA._id));
  check(
    'both carts coexist after the cross-mode probe',
    (await Cart.countDocuments({ user: userA._id })) === 1 &&
      (await Cart.countDocuments({ sessionId: crossSid })) === 1,
  );

  // Missing / null ownership fields are excluded from the partial unique
  // indexes, so they must never collide with each other or with real owners.
  const orphans = await Cart.collection.insertMany([
    { items: [] },
    { items: [] },
    { user: null, items: [] },
    { user: null, items: [] },
    { sessionId: null, items: [] },
    { sessionId: null, items: [] },
  ]);
  check('missing/null ownership documents never collide', orphans.insertedCount === 6, orphans.insertedCount);
  await Cart.collection.deleteMany({ _id: { $in: Object.values(orphans.insertedIds) } });

  // 6. Scenario D - regression of normal cart behaviour.
  section('D. Regression - normal create/get/update behaviour');
  const product = await Product.create({
    sku: `E61-${runTag}`,
    slug: `e61-regression-${runTag}`,
    name: { hy: 'E61 ծաղիկներ', en: 'E61 flowers', ru: 'E61 цветы' },
    category: new Types.ObjectId(),
    price: 1500,
    deliveryMethods: ['quick'],
    stock: 5,
    trackStock: true,
    isActive: true,
  });

  const again = await getOrCreateCart(memberOwner);
  check('repeat getOrCreateCart returns the SAME cart', String(again._id) === [...memberIds][0]);

  await addItem(memberOwner, { productId: String(product._id), quantity: 3, deliveryMethod: 'quick' });
  let view = await getCartView(memberOwner);
  check('addItem places the line in the basket', view.itemCount === 1, { itemCount: view.itemCount });
  check('unit price comes from the catalogue', view.items[0]?.unitPrice === 1500, view.items[0]?.unitPrice);
  const stockAfterAdd = (await Product.findById(product._id))?.stock;
  check('stock is not decremented by adding to the cart', stockAfterAdd === 5, stockAfterAdd);

  let refused: unknown = null;
  try {
    await addItem(memberOwner, { productId: String(product._id), quantity: 7, deliveryMethod: 'quick' });
  } catch (err) {
    refused = err;
  }
  check('adding beyond available stock is refused', refused !== null, String(refused));
  view = await getCartView(memberOwner);
  check(
    'the refused add left the basket unchanged',
    view.itemCount === 1 && view.items[0]?.quantity === 3,
    { itemCount: view.itemCount, quantity: view.items[0]?.quantity },
  );

  await updateItem(memberOwner, view.items[0].id, { quantity: 2 });
  view = await getCartView(memberOwner);
  check('updateItem applies the patch', view.items[0]?.quantity === 2, view.items[0]?.quantity);

  await removeItem(memberOwner, view.items[0].id);
  view = await getCartView(memberOwner);
  check('removeItem clears the line', view.itemCount === 0, view.itemCount);

  await addItem(memberOwner, { productId: String(product._id), quantity: 1, deliveryMethod: 'quick' });
  await clearCart(memberOwner);
  view = await getCartView(memberOwner);
  check('clearCart empties the basket', view.itemCount === 0, view.itemCount);

  await addItem({ sessionId: sidX }, { productId: String(product._id), quantity: 1, deliveryMethod: 'quick' });
  const guestView = await getCartView({ sessionId: sidX });
  check('guest cart add/get still works', guestView.itemCount === 1, guestView.itemCount);

  // 7. Scenario E - index verification against the collection itself.
  section('E. Cart index verification');
  const indexes = await Cart.collection.indexes();
  for (const index of indexes) {
    const bits = [
      JSON.stringify(index.key),
      index.unique ? 'unique' : '',
      index.sparse ? 'sparse' : '',
      index.expireAfterSeconds != null ? `ttl=${index.expireAfterSeconds}` : '',
      index.partialFilterExpression ? `partial=${JSON.stringify(index.partialFilterExpression)}` : '',
    ].filter(Boolean);
    console.log(`        ${index.name}: ${bits.join(' ')}`);
  }

  const userIdx = indexes.find((index) => index.name === 'user_1');
  const userPartial = JSON.stringify(userIdx?.partialFilterExpression);
  check('user_1 exists and is UNIQUE', userIdx?.unique === true, userIdx);
  check(
    'user_1 is type-partial ($type objectId), not merely sparse',
    userIdx?.sparse !== true && userPartial === JSON.stringify({ user: { $type: 'objectId' } }),
    userIdx,
  );

  const sessionIdx = indexes.find((index) => index.name === 'sessionId_1');
  const sessionPartial = JSON.stringify(sessionIdx?.partialFilterExpression);
  check('sessionId_1 exists and is UNIQUE', sessionIdx?.unique === true, sessionIdx);
  check(
    'sessionId_1 is type-partial ($type string), not merely sparse',
    sessionIdx?.sparse !== true && sessionPartial === JSON.stringify({ sessionId: { $type: 'string' } }),
    sessionIdx,
  );

  const ttlIdx = indexes.find((index) => index.name === 'updatedAt_1');
  check(
    'guest TTL index preserved (30d, partial on sessionId)',
    ttlIdx?.expireAfterSeconds === 60 * 60 * 24 * 30 &&
      JSON.stringify(ttlIdx?.partialFilterExpression) === JSON.stringify({ sessionId: { $exists: true } }),
    ttlIdx,
  );

  // Behavioural proof of the constraint itself (raw inserts bypass mongoose).
  const dupMember = await insertRaw({ user: member._id, items: [] });
  check('raw second cart for the same user is REJECTED with E11000', dupMember?.code === 11000, dupMember);
  const dupGuest = await insertRaw({ sessionId: guestSid, items: [] });
  check('raw second cart for the same sessionId is REJECTED with E11000', dupGuest?.code === 11000, dupGuest);
  const dbAfterProbes = {
    member: await Cart.countDocuments({ user: member._id }),
    guest: await Cart.countDocuments({ sessionId: guestSid }),
  };
  check(
    'probes left exactly one cart per owner in the DB',
    dbAfterProbes.member === 1 && dbAfterProbes.guest === 1,
    dbAfterProbes,
  );

  console.log(`\n${passed} passed, ${failed} failed\n`);
  await disconnectDatabase();
  await mongo.stop();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});


