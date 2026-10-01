/* eslint-disable no-console */
/**
 * Order-idempotency concurrency test (Checkpoint C).
 *
 * Proves that one basket can never become more than one order, and that every
 * status transition has exactly one winner running its side effects:
 *
 *   1. five concurrent submissions of the SAME basket   one order, one consumption
 *   2. replaying a consumed basket                      refused, no second order
 *   3. five concurrent submissions spending the same points  deducted exactly once
 *   4. two concurrent completions of the same order     reward/spend credited once,
 *                                                       repeats and clawback refused
 *   5. illegal status jumps                             rejected with nothing mutated
 *   6. customer and admin cancelling at once            refunded/restored exactly once
 *   7. forced sales counter                             cancelled, never driven negative
 *   8. direct single-document proof                     the cart-claim predicate vs a
 *                                                       negative control (no predicate)
 *
 * With `--no-transactions` (standalone MongoDB) order writes must be refused 503
 * with the basket, stock and points untouched, and the single-document claim is
 * still proven directly against MongoDB.
 *
 * The API is driven over HTTP; MongoDB is used directly only to set test state,
 * to read counts back and for the claim probe. A non-loopback MONGODB_URI is
 * refused outright, so a real cluster can never be touched.
 *
 * Start the API first (its log prints the in-memory URI), then:
 *   npm run dev:memory             + MONGODB_URI=<printed uri> -> npm run idempotency:concurrency
 *   npm run dev:memory:standalone  + MONGODB_URI=<printed uri> -> npm run idempotency:concurrency:no-tx
 *
 * Start the API with NODE_ENV=test to switch the write rate limiter off.
 */
import mongoose from 'mongoose';

const BASE = process.env.SMOKE_API ?? 'http://localhost:5000/api';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@anahit-flower.am';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!';
const EXPECT_REFUSAL = process.argv.includes('--no-transactions');
const MONGO_URI = process.env.MONGODB_URI ?? '';
const MONGO_DB = process.env.MONGODB_DB ?? 'anahit_flower';
/** The harness only ever touches a loopback database - never Atlas, never production. */
const LOOPBACK = /^mongodb(\+srv)?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(MONGO_URI);

let passed = 0;
let failed = 0;

let categoryId = '';
let deliveryDate = '';
let timeSlot = '';
let gradeLadder: { key: string; minSpend: number }[] = [];
const runTag = Date.now();

interface CallOptions {
  method?: string;
  body?: unknown;
  token?: string;
  sessionId?: string;
}

async function call(path: string, options: CallOptions = {}): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.sessionId) headers['x-session-id'] = options.sessionId;

  const response = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
    return;
  }
  failed += 1;
  console.log(`  FAIL  ${label}`);
  if (detail !== undefined) console.log('        ', JSON.stringify(detail).slice(0, 400));
}

function section(title: string) {
  console.log(`\n${title}`);
}

function statuses(results: { status: number }[]) {
  return results.map((r) => r.status).join(', ');
}

function expectedGrade(totalSpend: number) {
  return [...gradeLadder].sort((a, b) => b.minSpend - a.minSpend).find((g) => totalSpend >= g.minSpend)?.key ?? 'general';
}

/* ------------------------------- database -------------------------------- */

function db() {
  const connection = mongoose.connection.db;
  if (!connection) throw new Error('MongoDB is not connected');
  return connection;
}

async function connectMongo() {
  // Connected directly to the single loopback node: no replica-set discovery is
  // needed for test setup and assertions.
  await mongoose.connect(MONGO_URI.replace(/\?.*$/, ''), { dbName: MONGO_DB });
}

/** Test setup only: hand a member an exact balance / spend to race on. */
function setMember(email: string, patch: Record<string, unknown>) {
  return db().collection('users').updateOne({ email }, { $set: patch });
}

/** Test setup only: force a field the guards must cope with (e.g. a corrected counter). */
function setProduct(productId: string, patch: Record<string, unknown>) {
  return db().collection('products').updateOne({ _id: new mongoose.Types.ObjectId(productId) }, { $set: patch });
}

function countUserOrders(userId: string) {
  return db().collection('orders').countDocuments({ user: new mongoose.Types.ObjectId(userId) });
}

async function cartRow(userId: string) {
  return db().collection('carts').findOne({ user: new mongoose.Types.ObjectId(userId) });
}

/* --------------------------------- API ----------------------------------- */

async function newProduct(token: string, label: string, price: number, stock: number) {
  const created = await call('/admin/products', {
    method: 'POST',
    token,
    body: {
      name: { hy: `Idem ${label}`, en: `Idem ${label}`, ru: `Idem ${label}` },
      category: categoryId,
      price,
      deliveryMethods: ['quick', 'parcel'],
      images: [{ url: '/images/seed/bouquet-01.svg', order: 1 }],
      stock,
      trackStock: true,
      isActive: true,
    },
  });

  if (created.status !== 201) {
    throw new Error(`could not create the "${label}" product: ${JSON.stringify(created.body)}`);
  }
  return created.body.data as { id: string; stock: number };
}

async function readProduct(token: string, productId: string) {
  const res = await call(`/admin/products/${productId}`, { token });
  return res.body.data as { stock: number; soldCount: number };
}

async function newMember(tag: string) {
  const email = `idem_${runTag}_${tag}@example.com`;
  const registered = await call('/auth/register', {
    method: 'POST',
    body: { email, password: 'Secret123', name: 'Idempotency Tester', phone: '+374 99 111222', agreeTerms: true },
  });

  if (registered.status !== 201) throw new Error(`registration failed: ${JSON.stringify(registered.body)}`);
  return { email, token: registered.body.data.accessToken as string, id: registered.body.data.user.id as string };
}

async function summary(token: string) {
  const res = await call('/account/summary', { token });
  return res.body.data as { points: number; totalSpend: number; grade: { key: string } };
}

async function myOrders(token: string) {
  const res = await call('/orders?limit=50', { token });
  return res.body.data as any[];
}

async function findOrder(token: string, orderId: string) {
  const orders = await myOrders(token);
  return orders.find((order: any) => order.id === orderId);
}

function addToCart(token: string, productId: string, quantity: number) {
  return call('/cart/items', {
    method: 'POST',
    token,
    body: { productId, quantity, deliveryMethod: 'quick', deliveryDate, timeSlot, ribbonText: 'idempotency test' },
  });
}

async function cartItems(token: string) {
  const res = await call('/cart', { token });
  return res.body.data.items as any[];
}

function checkout(token: string, pointsUsed: number) {
  return call('/orders/checkout', {
    method: 'POST',
    token,
    body: {
      customer: { name: 'Idempotency Tester', email: `idem_${runTag}@example.com`, phone: '+374 99 111222' },
      delivery: {
        method: 'quick',
        recipient: 'Mariam',
        phone: '+374 91 000000',
        region: 'yerevan',
        city: 'Yerevan',
        street: 'Hanrapetutyan 25',
        requestedDate: deliveryDate,
        timeSlot,
      },
      pointsUsed,
      agreeTerms: true,
    },
  });
}

function adminStatus(token: string, orderId: string, status: string) {
  return call(`/admin/orders/${orderId}/status`, { method: 'PATCH', token, body: { status } });
}

async function advance(token: string, orderId: string, moves: string[]) {
  for (const status of moves) {
    const res = await adminStatus(token, orderId, status);
    if (res.status !== 200) throw new Error(`could not move ${orderId} to ${status}: ${JSON.stringify(res.body)}`);
  }
}

async function placeOrder(token: string, productId: string, quantity: number, pointsUsed: number) {
  const added = await addToCart(token, productId, quantity);
  if (added.status !== 201) throw new Error(`could not add to cart: ${JSON.stringify(added.body)}`);

  const placed = await checkout(token, pointsUsed);
  if (placed.status !== 201) throw new Error(`checkout failed: ${JSON.stringify(placed.body)}`);

  return placed.body.data.order as { id: string; code: string; total: number; pointsEarned: number; pointsUsed: number };
}

/* -------------------- single-document claim probe ------------------------ */

/**
 * Talks to MongoDB directly with no transaction involved: proves the predicate
 * checkout relies on - `'items.0': { $exists: true }` together with the emptying
 * in ONE update - is what limits consumption to exactly one submitter, and shows
 * with a negative control that the unconditional emptying of the design before
 * this checkpoint matches every concurrent submitter instead.
 */
async function verifySingleDocumentClaim() {
  section('8. The cart-claim predicate itself, proven directly against MongoDB');

  const probe = db().collection('__cart_claim_probe');
  await probe.deleteMany({});

  // Negative control: no emptiness predicate at all, exactly what checkout did
  // before this checkpoint, so every concurrent submitter "consumed" the basket.
  await probe.insertOne({ probe: 'naive', items: [{ sku: 'rose' }] });
  const naive = await Promise.all(Array.from({ length: 5 }, () => probe.updateOne({ probe: 'naive' }, { $set: { items: [] } })));
  check(
    'negative control: five unconditional consumes ALL report success',
    naive.filter((result) => result.matchedCount === 1).length === 5,
    naive.map((result) => result.matchedCount),
  );

  // The claim checkout now uses: emptiness check + emptying as ONE update.
  await probe.insertOne({ probe: 'claimed', items: [{ sku: 'rose' }] });
  const claimed = await Promise.all(
    Array.from({ length: 5 }, () =>
      probe.updateOne({ probe: 'claimed', 'items.0': { $exists: true } }, { $set: { items: [] } }),
    ),
  );
  const afterClaimed = await probe.findOne({ probe: 'claimed' });
  check(
    'exactly one of five concurrent claims consumes the basket',
    claimed.filter((result) => result.matchedCount === 1).length === 1,
    claimed.map((result) => result.matchedCount),
  );
  check('the basket ends consumed exactly once', Array.isArray(afterClaimed?.items) && afterClaimed.items.length === 0, afterClaimed);

  // The same predicate shape that keeps the sales counter from going negative.
  await probe.insertOne({ probe: 'counter', soldCount: 1 });
  await Promise.all(
    Array.from({ length: 5 }, () => probe.updateOne({ probe: 'counter', soldCount: { $gte: 1 } }, { $inc: { soldCount: -1 } })),
  );
  const afterCounter = await probe.findOne({ probe: 'counter' });
  check('the guarded sales counter stops at exactly zero', afterCounter?.soldCount === 0, afterCounter);

  await probe.insertOne({ probe: 'counter-naive', soldCount: 1 });
  await Promise.all(Array.from({ length: 5 }, () => probe.updateOne({ probe: 'counter-naive' }, { $inc: { soldCount: -1 } })));
  const afterCounterNaive = await probe.findOne({ probe: 'counter-naive' });
  check(
    'negative control: the unguarded counter IS driven negative',
    typeof afterCounterNaive?.soldCount === 'number' && afterCounterNaive.soldCount < 0,
    afterCounterNaive,
  );

  await probe.drop();
}

/**
 * No-transaction mode: every order mutation must be refused, never applied in
 * half, and the basket must survive untouched so nothing is silently consumed.
 */
async function refusalScenarios(adminToken: string) {
  section('1. No-transaction deployment - checkout is refused, never half-applied');

  const product = await newProduct(adminToken, 'refused', 1000, 10);
  const member = await newMember('refused');
  await setMember(member.email, { points: 500, totalSpend: 0, grade: 'general' });
  await addToCart(member.token, product.id, 1);

  const refused = await checkout(member.token, 100);
  check('checkout is refused with 503', refused.status === 503, refused.body);
  check('the refusal is reported as TRANSACTIONS_UNAVAILABLE', refused.body?.code === 'TRANSACTIONS_UNAVAILABLE', refused.body);

  const basket = await cartItems(member.token);
  check('the basket is left untouched by the refusal', basket.length === 1, basket);
  const storedBasket = await cartRow(member.id);
  check('the stored basket still holds its item', (storedBasket?.items ?? []).length === 1, storedBasket);

  check('no order was created by the refusal', (await myOrders(member.token)).length === 0);
  const stock = await readProduct(adminToken, product.id);
  check('the stock is untouched by the refusal', stock.stock === 10 && stock.soldCount === 0, stock);
  const after = await summary(member.token);
  check('the points are untouched by the refusal', after.points === 500, after);

  const refusedMove = await adminStatus(adminToken, '507f1f77bcf86cd799439011', 'confirmed');
  check('admin status moves are refused as well', refusedMove.status === 503, refusedMove.body);
}

async function transactionalScenarios(adminToken: string) {
  /* --------------- 1. five concurrent submissions of one basket -------------- */
  section('1. Five concurrent submissions of the same basket');

  const product1 = await newProduct(adminToken, 'same-cart', 1000, 50);
  const member1 = await newMember('same-cart');
  await setMember(member1.email, { points: 0, totalSpend: 0, grade: 'general' });
  await addToCart(member1.token, product1.id, 2);

  const attempts1 = await Promise.all(Array.from({ length: 5 }, () => checkout(member1.token, 0)));
  const orders1 = await myOrders(member1.token);
  const storedOrders1 = await countUserOrders(member1.id);
  const stock1 = await readProduct(adminToken, product1.id);
  const basket1 = await cartItems(member1.token);
  const storedBasket1 = await cartRow(member1.id);

  check('exactly one of the five submissions creates an order', attempts1.filter((r) => r.status === 201).length === 1, statuses(attempts1));
  check('the other four are clean client refusals, never a 500', attempts1.every((r) => [201, 400, 409].includes(r.status)), statuses(attempts1));
  check('the basket becomes exactly one order', orders1.length === 1, orders1.map((o) => o.code));
  check('no duplicate order document exists in MongoDB', storedOrders1 === 1, storedOrders1);
  check('the basket is consumed exactly once (empty through the API)', basket1.length === 0, basket1);
  check('the stored basket document is consumed too', (storedBasket1?.items ?? []).length === 0, storedBasket1);
  check('stock is decremented exactly once', stock1.stock === 48, stock1);
  check('the sales counter moved exactly once', stock1.soldCount === 2, stock1);

  /* ------------------- 2. replaying a consumed basket ----------------------- */
  section('2. Replaying a consumed basket, sequentially');

  const replays = [await checkout(member1.token, 0), await checkout(member1.token, 0), await checkout(member1.token, 0)];
  const ordersAfterReplay = await myOrders(member1.token);
  const storedAfterReplay = await countUserOrders(member1.id);
  const stockAfterReplay = await readProduct(adminToken, product1.id);

  check('every replay is refused as a client error', replays.every((r) => r.status === 400), statuses(replays));
  check('the replay says the basket is empty', replays.every((r) => /cart is empty/i.test(r.body?.message ?? '')), replays.map((r) => r.body?.message));
  check('no replay creates another order', ordersAfterReplay.length === 1, ordersAfterReplay.map((o) => o.code));
  check('the stored order count stays at one', storedAfterReplay === 1, storedAfterReplay);
  check('a replay moves no stock', stockAfterReplay.stock === 48 && stockAfterReplay.soldCount === 2, stockAfterReplay);

  /* ------------ 3. five concurrent submissions spending the points ----------- */
  section('3. Five concurrent submissions spending the same points');

  const product3 = await newProduct(adminToken, 'same-points', 1000, 50);
  const member3 = await newMember('same-points');
  await setMember(member3.email, { points: 1000, totalSpend: 0, grade: 'general' });
  await addToCart(member3.token, product3.id, 1);

  const attempts3 = await Promise.all(Array.from({ length: 5 }, () => checkout(member3.token, 1000)));
  const orders3 = await myOrders(member3.token);
  const after3 = await summary(member3.token);
  const spent3 = orders3.reduce((sum: number, order: any) => sum + (order.pointsUsed ?? 0), 0);
  const stock3 = await readProduct(adminToken, product3.id);

  check('exactly one order is created', orders3.length === 1, orders3.map((o) => o.code));
  check('the race ends as client outcomes, never a 500', attempts3.every((r) => [201, 400, 409].includes(r.status)), statuses(attempts3));
  check('the points are deducted exactly once', after3.points === 0, after3);
  check('balance plus spends always adds up', after3.points + spent3 === 1000, { balance: after3.points, spent: spent3 });
  check('the balance never goes negative', after3.points >= 0, after3);
  check('stock moved exactly once in the points race', stock3.stock === 49 && stock3.soldCount === 1, stock3);

  /* --------------- 4. two concurrent completions of one order --------------- */
  section('4. Two concurrent completions of the same order');

  const product4 = await newProduct(adminToken, 'complete', 1000, 20);
  const member4 = await newMember('complete');
  await setMember(member4.email, { points: 0, totalSpend: 0, grade: 'general' });
  const order4 = await placeOrder(member4.token, product4.id, 1, 0);
  await advance(adminToken, order4.id, ['confirmed', 'preparing', 'delivering', 'delivered']);

  const completions4 = await Promise.all([
    adminStatus(adminToken, order4.id, 'completed'),
    adminStatus(adminToken, order4.id, 'completed'),
  ]);
  const after4 = await summary(member4.token);

  check('exactly one completion is accepted', completions4.filter((r) => r.status === 200).length === 1, statuses(completions4));
  check('the losing completion is a clean client error', completions4.every((r) => [200, 400, 409].includes(r.status)), statuses(completions4));
  check('the reward is credited exactly once', after4.points === order4.pointsEarned, { got: after4.points, expected: order4.pointsEarned });
  check('lifetime spend is credited exactly once', after4.totalSpend === order4.total, { got: after4.totalSpend, expected: order4.total });
  check('the grade follows the credited spend', after4.grade.key === expectedGrade(after4.totalSpend), after4.grade);

  const repeat4 = await adminStatus(adminToken, order4.id, 'completed');
  const afterRepeat4 = await summary(member4.token);
  check('a repeated sequential completion is rejected', repeat4.status === 400, repeat4.body);
  check('the rejected repeat credits nothing', afterRepeat4.points === after4.points && afterRepeat4.totalSpend === after4.totalSpend, afterRepeat4);

  const clawback4 = await adminStatus(adminToken, order4.id, 'cancelled');
  const afterClaw4 = await summary(member4.token);
  check('a completed order cannot be cancelled afterwards', clawback4.status === 400, clawback4.body);
  check('the completed rewards are not clawed back', afterClaw4.points === after4.points && afterClaw4.totalSpend === after4.totalSpend, afterClaw4);

  /* ------------------- 5. illegal transitions, no side effects -------------- */
  section('5. Illegal status transitions are rejected without side effects');

  const product5 = await newProduct(adminToken, 'illegal', 1000, 20);
  const member5 = await newMember('illegal');
  await setMember(member5.email, { points: 0, totalSpend: 0, grade: 'general' });
  const order5 = await placeOrder(member5.token, product5.id, 2, 0);
  const stock5 = await readProduct(adminToken, product5.id);

  const jump5 = await adminStatus(adminToken, order5.id, 'delivered');
  const afterJump5 = await summary(member5.token);
  const stockAfterJump5 = await readProduct(adminToken, product5.id);
  const row5 = await findOrder(member5.token, order5.id);

  check('a status jump that skips the flow is rejected', jump5.status === 400, jump5.body);
  check('the order keeps its previous status', row5?.status === 'pending', row5?.status);
  check('an illegal transition credits no points and no spend', afterJump5.points === 0 && afterJump5.totalSpend === 0, afterJump5);
  check('an illegal transition moves no stock', stockAfterJump5.stock === stock5.stock && stockAfterJump5.soldCount === stock5.soldCount, { before: stock5, after: stockAfterJump5 });

  await adminStatus(adminToken, order5.id, 'confirmed');
  const race5 = await Promise.all([
    adminStatus(adminToken, order5.id, 'confirmed'),
    adminStatus(adminToken, order5.id, 'delivered'),
  ]);
  const row5b = await findOrder(member5.token, order5.id);
  const afterRace5 = await summary(member5.token);
  check('concurrent repeated/illegal moves never 500', race5.every((r) => [400, 409].includes(r.status)), statuses(race5));
  check('the order stays where the last legal move put it', row5b?.status === 'confirmed', row5b?.status);
  check('the race credits nothing', afterRace5.points === 0 && afterRace5.totalSpend === 0, afterRace5);

  /* ------------ 6. customer and admin cancelling the same order ------------- */
  section('6. Customer and admin cancelling the same order at once');

  const product6 = await newProduct(adminToken, 'cancel', 500, 20);
  const member6 = await newMember('cancel');
  await setMember(member6.email, { points: 1000, totalSpend: 0, grade: 'general' });
  const order6 = await placeOrder(member6.token, product6.id, 2, 300);
  check('the order spent the points it was asked to spend', order6.pointsUsed === 300, order6.pointsUsed);
  await adminStatus(adminToken, order6.id, 'confirmed');

  const cancels6 = await Promise.all([
    call(`/orders/${order6.code}/cancel`, { method: 'POST', token: member6.token, body: { reason: 'changed my mind' } }),
    adminStatus(adminToken, order6.id, 'cancelled'),
  ]);
  const after6 = await summary(member6.token);
  const stock6 = await readProduct(adminToken, product6.id);

  check('exactly one cancellation is accepted', cancels6.filter((r) => r.status === 200).length === 1, statuses(cancels6));
  check('the losing cancellation is a clean client error', cancels6.every((r) => [200, 400, 409].includes(r.status)), statuses(cancels6));
  check('the points are refunded exactly once', after6.points === 1000, after6);
  check('stock is restored exactly once', stock6.stock === 20, stock6);
  check('the sales counter returns to zero, never negative', stock6.soldCount === 0 && stock6.soldCount >= 0, stock6);

  const repeatCancel6 = await call(`/orders/${order6.code}/cancel`, { method: 'POST', token: member6.token, body: { reason: 'again' } });
  const stock6b = await readProduct(adminToken, product6.id);
  const afterRepeat6 = await summary(member6.token);
  check('a repeated sequential cancellation is refused', repeatCancel6.status === 400, repeatCancel6.body);
  check('the refused repeat restores no stock', stock6b.stock === 20, stock6b);
  check('the refused repeat refunds no points', afterRepeat6.points === 1000, afterRepeat6);

  /* --------------- 7. the sales counter can never go negative --------------- */
  section('7. The sales counter can never go negative');

  const product7 = await newProduct(adminToken, 'guard', 500, 10);
  const member7 = await newMember('guard');
  const order7 = await placeOrder(member7.token, product7.id, 2, 0);
  await adminStatus(adminToken, order7.id, 'confirmed');
  // Forced state: an operator corrected the counter to zero while the order was open.
  await setProduct(product7.id, { soldCount: 0 });

  const cancel7 = await adminStatus(adminToken, order7.id, 'cancelled');
  const stock7 = await readProduct(adminToken, product7.id);

  check('the cancellation still succeeds', cancel7.status === 200, cancel7.body);
  check('the sales counter is never driven negative', stock7.soldCount === 0 && stock7.soldCount >= 0, stock7);
  check('the stock restore still lands', stock7.stock === 10, stock7);
}

async function finish() {
  await mongoose.disconnect();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

async function main() {
  if (!LOOPBACK) {
    throw new Error(
      'MONGODB_URI must point at a loopback MongoDB (127.0.0.1 / localhost): this harness refuses to touch a real cluster',
    );
  }

  const health = await call('/health');
  if (health.status !== 200) {
    throw new Error(`the API is not answering at ${BASE} - start it with "npm run dev:memory" first`);
  }

  const options = await call('/delivery/options');
  const quick = options.body.data.methods.find((m: any) => m.method === 'quick');
  deliveryDate = quick.calendar.find((d: any) => d.available).date;
  timeSlot = quick.timeSlots[0];

  const config = await call('/config');
  gradeLadder = (config.body.data.grades ?? []).map((grade: any) => ({
    key: String(grade.key),
    minSpend: Number(grade.minSpend ?? 0),
  }));
  if (gradeLadder.length === 0) throw new Error('/config did not expose the member grade ladder');

  const login = await call('/auth/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  if (login.status !== 200) throw new Error(`admin login failed: ${JSON.stringify(login.body)}`);
  const adminToken: string = login.body.data.accessToken;

  const categories = await call('/admin/categories', { token: adminToken });
  categoryId = categories.body.data.find((c: any) => c.code === '00010001')?.id;
  if (!categoryId) throw new Error('seed category 00010001 is missing - seed the database first');

  await connectMongo();

  console.log(`\nOrder idempotency concurrency test against ${BASE}`);
  console.log(`direct MongoDB harness connection to ${MONGO_DB}`);
  console.log(
    EXPECT_REFUSAL
      ? 'Mode: no transactions - order writes must be REFUSED'
      : 'Mode: transactions - one basket must become at most one order',
  );

  if (EXPECT_REFUSAL) {
    await refusalScenarios(adminToken);
  } else {
    await transactionalScenarios(adminToken);
  }

  await verifySingleDocumentClaim();
  await finish();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});

/**
 * Module scope on purpose: keeps this harness out of the globals declared by the
 * other plain-script harnesses (smoke.ts, stockConcurrency.ts).
 */
export {};
