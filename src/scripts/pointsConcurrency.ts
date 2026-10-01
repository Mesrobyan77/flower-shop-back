/* eslint-disable no-console */
/**
 * Bonus-point concurrency test.
 *
 * Proves the member-point rules hold under concurrency:
 *
 *   1. spend race where the balance covers exactly one order   one claim wins, balance lands on 0
 *   2. spend race where the balance covers neither claimant    one claim wins, the rest refused
 *   3. concurrent completion of the SAME order                reward credited exactly once
 *   4. concurrent completion of DIFFERENT orders             no increment is lost
 *   5. concurrent cancellation (customer + admin)            refunded once, stock restored once
 *   6. no-transaction deployment                             order writes refused, and the
 *                                                            single-document guards are proven
 *                                                            directly against MongoDB
 *
 * The API is driven over HTTP; MongoDB is used directly only to hand a test member
 * a precise balance, to read state back, and for the guard probe. A non-loopback
 * MONGODB_URI is refused outright, so a real cluster can never be touched.
 *
 * Start the API first (its log prints the in-memory URI), then:
 *   npm run dev:memory             + MONGODB_URI=<printed uri> -> npm run points:concurrency
 *   npm run dev:memory:standalone  + MONGODB_URI=<printed uri> -> npm run points:concurrency:no-tx
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
let skipped = 0;

let categoryId = '';
let deliveryDate = '';
let timeSlot = '';
let gradeLadder: { key: string; minSpend: number }[] = [];
const runTag = Date.now();

interface CallOptions {
  method?: string;
  body?: unknown;
  token?: string;
}

async function call(path: string, options: CallOptions = {}): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

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

function skip(label: string, why: string) {
  skipped += 1;
  console.log(`  SKIP  ${label} (${why})`);
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

/** Test setup only: hand a member an exact balance / lifetime spend to race on. */
function setMember(email: string, patch: Record<string, unknown>) {
  return db().collection('users').updateOne({ email }, { $set: patch });
}

async function memberRow(email: string) {
  return db().collection('users').findOne({ email });
}

/* --------------------------------- API ----------------------------------- */

async function newProduct(token: string, label: string, price: number, stock: number) {
  const created = await call('/admin/products', {
    method: 'POST',
    token,
    body: {
      name: { hy: `Points ${label}`, en: `Points ${label}`, ru: `Points ${label}` },
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
  const email = `points_${runTag}_${tag}@example.com`;
  const registered = await call('/auth/register', {
    method: 'POST',
    body: { email, password: 'Secret123', name: 'Points Tester', phone: '+374 99 111222', agreeTerms: true },
  });

  if (registered.status !== 201) throw new Error(`registration failed: ${JSON.stringify(registered.body)}`);
  return { email, token: registered.body.data.accessToken as string };
}

async function summary(token: string) {
  const res = await call('/account/summary', { token });
  return res.body.data as { points: number; totalSpend: number; grade: { key: string } };
}

async function myOrders(token: string) {
  const res = await call('/orders?limit=50', { token });
  return res.body.data as any[];
}

function addToCart(token: string, productId: string, quantity: number) {
  return call('/cart/items', {
    method: 'POST',
    token,
    body: { productId, quantity, deliveryMethod: 'quick', deliveryDate, timeSlot, ribbonText: 'points test' },
  });
}

function checkout(token: string, pointsUsed: number) {
  return call('/orders/checkout', {
    method: 'POST',
    token,
    body: {
      customer: { name: 'Points Tester', email: `points_${runTag}@example.com`, phone: '+374 99 111222' },
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

/* -------------------- single-document guard probe ------------------------ */

/**
 * Talks to MongoDB directly with no transaction involved: proves that the
 * `{ points: { $gte: n } }` + `$inc` guard is what keeps a balance from going
 * negative, and that the same race without the guard does go negative.
 */
async function verifySingleDocumentGuards() {
  section('6. Single-document guards, verified independently of transactions');

  const probe = db().collection('__points_guard_probe');
  await probe.deleteMany({});

  await probe.insertOne({ probe: 'guarded', points: 1 });
  const guarded = await Promise.all(
    Array.from({ length: 5 }, () => probe.updateOne({ probe: 'guarded', points: { $gte: 1 } }, { $inc: { points: -1 } })),
  );
  const afterGuarded = await probe.findOne({ probe: 'guarded' });
  check(
    'only one of five concurrent guarded claims wins',
    guarded.filter((result) => result.matchedCount === 1).length === 1,
    guarded.map((result) => result.matchedCount),
  );
  check('the guarded balance stops at exactly zero', afterGuarded?.points === 0, afterGuarded);

  await probe.insertOne({ probe: 'unguarded', points: 1 });
  await Promise.all(Array.from({ length: 5 }, () => probe.updateOne({ probe: 'unguarded' }, { $inc: { points: -1 } })));
  const afterUnguarded = await probe.findOne({ probe: 'unguarded' });
  check(
    'negative control: the unguarded balance is driven negative',
    typeof afterUnguarded?.points === 'number' && afterUnguarded.points < 0,
    afterUnguarded,
  );

  await probe.drop();
}

/**
 * No-transaction mode: every order mutation must be refused, never applied in half.
 */
async function refusalScenarios(adminToken: string) {
  section('6. No-transaction deployment - order writes are refused, never half-applied');

  const product = await newProduct(adminToken, 'refused', 1000, 10);
  const member = await newMember('refused');
  await setMember(member.email, { points: 500, totalSpend: 0, grade: 'general' });
  await addToCart(member.token, product.id, 1);

  const refused = await checkout(member.token, 100);
  check('checkout is refused with 503', refused.status === 503, refused.body);
  check(
    'the refusal is reported as TRANSACTIONS_UNAVAILABLE',
    refused.body?.code === 'TRANSACTIONS_UNAVAILABLE',
    refused.body,
  );

  const after = await summary(member.token);
  check('the bonus balance is untouched by the refusal', after.points === 500, after);
  check('no order was created by the refusal', (await myOrders(member.token)).length === 0);

  const stock = await readProduct(adminToken, product.id);
  check('the stock is untouched by the refusal', stock.stock === 10 && stock.soldCount === 0, stock);

  const refusedMove = await adminStatus(adminToken, '507f1f77bcf86cd799439011', 'confirmed');
  check('admin status moves are refused as well', refusedMove.status === 503, refusedMove.body);
}

async function transactionalScenarios(adminToken: string) {
  /* ---------------------- 1. spend race with one winner -------------------- */
  section('1. Five concurrent spends, a balance that covers exactly one');

  const product1 = await newProduct(adminToken, 'race', 1000, 50);
  const member1 = await newMember('race');
  await setMember(member1.email, { points: 1000, totalSpend: 0, grade: 'general' });
  await addToCart(member1.token, product1.id, 1);

  const attempts1 = await Promise.all(Array.from({ length: 5 }, () => checkout(member1.token, 1000)));
  const orders1 = await myOrders(member1.token);
  const after1 = await summary(member1.token);
  const row1 = await memberRow(member1.email);
  const spent1 = orders1.reduce((sum: number, order: any) => sum + (order.pointsUsed ?? 0), 0);

  check('exactly one order claims the whole balance', orders1.filter((o: any) => o.pointsUsed === 1000).length === 1, orders1.map((o: any) => o.pointsUsed));
  check('the balance lands on zero', after1.points === 0, after1);
  check('the balance never goes negative', after1.points >= 0, after1);
  check('balance plus spends always adds up', after1.points + spent1 === 1000, { balance: after1.points, spent: spent1 });
  check('the API summary matches the stored balance', row1?.points === after1.points, { api: after1.points, stored: row1?.points });
  check(
    'every attempt ends as a client outcome, never a 500',
    attempts1.every((result) => [201, 400, 409].includes(result.status)),
    statuses(attempts1),
  );

  /* ------------------ 2. spend race the balance cannot cover --------------- */
  section('2. Two concurrent spends against a balance that covers neither');

  const product2 = await newProduct(adminToken, 'short', 1000, 50);
  const member2 = await newMember('short');
  await setMember(member2.email, { points: 100, totalSpend: 0, grade: 'general' });
  await addToCart(member2.token, product2.id, 1);

  const attempts2 = await Promise.all([checkout(member2.token, 60), checkout(member2.token, 60)]);
  const orders2 = await myOrders(member2.token);
  const after2 = await summary(member2.token);
  const spent2 = orders2.reduce((sum: number, order: any) => sum + (order.pointsUsed ?? 0), 0);

  check('only one of the two claimants is served in full', orders2.filter((o: any) => o.pointsUsed === 60).length === 1, orders2.map((o: any) => o.pointsUsed));
  check('nothing is spent that the member did not have', after2.points + spent2 === 100, { balance: after2.points, spent: spent2 });
  check('the balance never goes negative', after2.points >= 0, after2);
  check(
    'every attempt ends as a client outcome, never a 500',
    attempts2.every((result) => [201, 409].includes(result.status)),
    statuses(attempts2),
  );

  /* --------------- 3. the same order completed twice at once --------------- */
  section('3. Two concurrent completions of the same order');

  const product3 = await newProduct(adminToken, 'complete', 1000, 20);
  const member3 = await newMember('complete');
  await setMember(member3.email, { points: 0, totalSpend: 29500, grade: 'general' });
  const order3 = await placeOrder(member3.token, product3.id, 1, 0);
  await advance(adminToken, order3.id, ['confirmed', 'preparing', 'delivering', 'delivered']);

  const completions3 = await Promise.all([
    adminStatus(adminToken, order3.id, 'completed'),
    adminStatus(adminToken, order3.id, 'completed'),
  ]);
  const after3 = await summary(member3.token);
  const expectedSpend3 = 29500 + order3.total;

  check('only one completion is accepted', completions3.filter((r) => r.status === 200).length === 1, statuses(completions3));
  check(
    'the losing completion is a clean client error',
    completions3.every((r) => [200, 400, 409].includes(r.status)),
    statuses(completions3),
  );
  check('the points reward is credited exactly once', after3.points === order3.pointsEarned, { got: after3.points, expected: order3.pointsEarned });
  check('lifetime spend is credited exactly once', after3.totalSpend === expectedSpend3, { got: after3.totalSpend, expected: expectedSpend3 });
  check(
    'the grade follows the incremented lifetime spend',
    after3.grade.key === expectedGrade(expectedSpend3),
    { got: after3.grade.key, expected: expectedGrade(expectedSpend3) },
  );
  check('the tier assertion above is meaningful (the threshold is crossed)', expectedGrade(expectedSpend3) !== 'general', expectedGrade(expectedSpend3));

  /* --------- 4. two different orders of one member completed at once ------- */
  section('4. Two different orders of one member completed at once');

  const product4a = await newProduct(adminToken, 'multi-a', 1000, 20);
  const product4b = await newProduct(adminToken, 'multi-b', 2000, 20);
  const member4 = await newMember('multi');
  await setMember(member4.email, { points: 0, totalSpend: 29000, grade: 'general' });

  const order4a = await placeOrder(member4.token, product4a.id, 1, 0);
  const order4b = await placeOrder(member4.token, product4b.id, 1, 0);
  await advance(adminToken, order4a.id, ['confirmed', 'preparing', 'delivering', 'delivered']);
  await advance(adminToken, order4b.id, ['confirmed', 'preparing', 'delivering', 'delivered']);

  const completions4 = await Promise.all([
    adminStatus(adminToken, order4a.id, 'completed'),
    adminStatus(adminToken, order4b.id, 'completed'),
  ]);
  const after4 = await summary(member4.token);
  const expectedSpend4 = 29000 + order4a.total + order4b.total;
  const expectedPoints4 = order4a.pointsEarned + order4b.pointsEarned;

  check('both completions are accepted', completions4.every((r) => r.status === 200), statuses(completions4));
  check('no points increment is lost', after4.points === expectedPoints4, { got: after4.points, expected: expectedPoints4 });
  check('lifetime spend keeps both increments', after4.totalSpend === expectedSpend4, { got: after4.totalSpend, expected: expectedSpend4 });
  check(
    'the grade matches the combined lifetime spend',
    after4.grade.key === expectedGrade(expectedSpend4),
    { got: after4.grade.key, expected: expectedGrade(expectedSpend4) },
  );

  /* ------------- 5. customer and admin cancelling at the same time --------- */
  section('5. Customer and admin cancelling the same order at once');

  const product5 = await newProduct(adminToken, 'cancel', 500, 20);
  const member5 = await newMember('cancel');
  await setMember(member5.email, { points: 1000, totalSpend: 0, grade: 'general' });

  const order5 = await placeOrder(member5.token, product5.id, 2, 300);
  check('the order spent the points it was asked to spend', order5.pointsUsed === 300, order5.pointsUsed);

  await adminStatus(adminToken, order5.id, 'confirmed');
  const afterSpend5 = await summary(member5.token);
  check('the points were taken at checkout', afterSpend5.points === 700, afterSpend5);

  const cancels5 = await Promise.all([
    call(`/orders/${order5.code}/cancel`, { method: 'POST', token: member5.token, body: { reason: 'changed my mind' } }),
    adminStatus(adminToken, order5.id, 'cancelled'),
  ]);
  const after5 = await summary(member5.token);
  const stock5 = await readProduct(adminToken, product5.id);

  check('only one cancellation is accepted', cancels5.filter((r) => r.status === 200).length === 1, statuses(cancels5));
  check(
    'the losing cancellation is a clean client error',
    cancels5.every((r) => [200, 400, 409].includes(r.status)),
    statuses(cancels5),
  );
  check('the points are refunded exactly once', after5.points === 1000, after5);
  check('the balance never exceeds what the member had', after5.points <= 1000, after5);
  check('the stock is restored exactly once', stock5.stock === 20, stock5);
}

async function finish() {
  await mongoose.disconnect();
  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped\n`);
  process.exit(failed === 0 && skipped === 0 ? 0 : 1);
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

  console.log(`\nBonus point concurrency test against ${BASE}`);
  console.log(`direct MongoDB harness connection to ${MONGO_DB}`);
  console.log(
    EXPECT_REFUSAL
      ? 'Mode: no transactions - order writes must be REFUSED'
      : 'Mode: transactions - order writes must be ATOMIC',
  );

  if (EXPECT_REFUSAL) {
    await refusalScenarios(adminToken);
  } else {
    await transactionalScenarios(adminToken);
  }

  await verifySingleDocumentGuards();
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
