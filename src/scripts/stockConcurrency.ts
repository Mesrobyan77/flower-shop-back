/* eslint-disable no-console */
/**
 * Stock-atomicity concurrency test.
 *
 * Drives the real HTTP API and proves that stock can never be oversold or pushed
 * negative - on a deployment with transactions and on one without:
 *
 *   1. normal checkout       stock drops by exactly the ordered quantity
 *   2. insufficient stock    checkout is refused and stock is untouched
 *   3. duplicate lines       two lines of one product are validated in total
 *   4. concurrent checkout   five buyers race for the last unit; exactly one wins
 *   5. untracked product     `trackStock: false` only moves the sales counter
 *   6. no transactions       with `--no-transactions` order writes are refused
 *                            (503) instead of being applied non-atomically
 *
 * Run the API first, then the matching mode:
 *   npm run dev:memory               -> npm run stock:concurrency
 *   npm run dev:memory:standalone    -> npm run stock:concurrency:no-tx
 *
 * Start the API with NODE_ENV=test to switch the write rate limiter off; a burst
 * of concurrent checkouts would otherwise trip it.
 */
const BASE = process.env.SMOKE_API ?? 'http://localhost:5000/api';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@anahit-flower.am';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!';
const EXPECT_REFUSAL = process.argv.includes('--no-transactions');

let passed = 0;
let failed = 0;

let categoryId = '';
let deliveryDate = '';
let timeSlot = '';
const runTag = Date.now();

interface CallOptions {
  method?: string;
  body?: unknown;
  token?: string;
  sessionId?: string;
}

/** Guest sessions travel as `x-session-id`, which `guestSession` accepts. */
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

function guest(tag: string) {
  return `stock-test-${runTag}-${tag}`;
}

async function newProduct(token: string, label: string, stock: number, trackStock: boolean) {
  const created = await call('/admin/products', {
    method: 'POST',
    token,
    body: {
      name: { hy: `Stock ${label}`, en: `Stock ${label}`, ru: `Stock ${label}` },
      category: categoryId,
      price: 1000,
      deliveryMethods: ['quick', 'parcel'],
      images: [{ url: '/images/seed/bouquet-01.svg', order: 1 }],
      stock,
      trackStock,
      isActive: true,
    },
  });

  if (created.status !== 201) {
    throw new Error(`could not create the "${label}" test product: ${JSON.stringify(created.body)}`);
  }
  return created.body.data as { id: string; slug: string };
}

async function readProduct(token: string, productId: string) {
  const res = await call(`/admin/products/${productId}`, { token });
  return res.body.data as { stock: number; soldCount: number; trackStock: boolean };
}

async function setStock(token: string, productId: string, stock: number) {
  await call(`/admin/products/${productId}`, { method: 'PATCH', token, body: { stock } });
}

async function orderCount(token: string) {
  const res = await call('/admin/stats', { token });
  return Number(res.body.data.totals.orders);
}

function addToCart(sessionId: string, productId: string, quantity: number, ribbonText = 'stock test') {
  return call('/cart/items', {
    method: 'POST',
    sessionId,
    body: { productId, quantity, deliveryMethod: 'quick', deliveryDate, timeSlot, ribbonText },
  });
}

function checkout(sessionId: string) {
  return call('/orders/checkout', {
    method: 'POST',
    sessionId,
    body: {
      customer: { name: 'Stock Tester', email: `stock_${runTag}@example.com`, phone: '+374 99 111222' },
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
      agreeTerms: true,
    },
  });
}

async function main() {
  const health = await call('/health');
  if (health.status !== 200) {
    throw new Error(`the API is not answering at ${BASE} - start it with "npm run dev:memory" first`);
  }

  const options = await call('/delivery/options');
  const quick = options.body.data.methods.find((m: any) => m.method === 'quick');
  deliveryDate = quick.calendar.find((d: any) => d.available).date;
  timeSlot = quick.timeSlots[0];

  const login = await call('/auth/login', {
    method: 'POST',
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (login.status !== 200) throw new Error(`admin login failed: ${JSON.stringify(login.body)}`);
  const adminToken: string = login.body.data.accessToken;

  const categories = await call('/admin/categories', { token: adminToken });
  categoryId = categories.body.data.find((c: any) => c.code === '00010001')?.id;
  if (!categoryId) throw new Error('seed category 00010001 is missing - seed the database first');

  console.log(`\nStock concurrency test against ${BASE}`);
  console.log(
    EXPECT_REFUSAL
      ? 'Mode: expecting order writes to be REFUSED (no transactions)'
      : 'Mode: expecting order writes to be ATOMIC (transactions)',
  );

  /**
   * Without transactions every checkout is refused, so the atomicity scenarios
   * below cannot run. In that mode the point is the refusal itself: nothing may
   * be half-applied and the cart has to survive.
   */
  if (EXPECT_REFUSAL) {
    section('No-transaction deployment - order writes are refused, never half-applied');

    const blocked = await newProduct(adminToken, 'no-tx', 10, true);
    const blockedSession = guest('no-tx');
    const blockedAdd = await addToCart(blockedSession, blocked.id, 1);
    check('cart writes still work without transactions', blockedAdd.status === 201, blockedAdd.body);

    const ordersBeforeBlocked = await orderCount(adminToken);
    const blockedCheckout = await checkout(blockedSession);
    check('checkout is refused with 503', blockedCheckout.status === 503, blockedCheckout.body);
    check(
      'the refusal is reported as TRANSACTIONS_UNAVAILABLE',
      blockedCheckout.body?.code === 'TRANSACTIONS_UNAVAILABLE',
      blockedCheckout.body,
    );

    const blockedAfter = await readProduct(adminToken, blocked.id);
    check(
      'no stock moved in the refused checkout',
      blockedAfter.stock === 10 && blockedAfter.soldCount === 0,
      blockedAfter,
    );
    check('no order was created by the refused checkout', (await orderCount(adminToken)) - ordersBeforeBlocked === 0);

    const keptCart = await call('/cart', { sessionId: blockedSession });
    check('the cart survives the refused checkout', keptCart.body.data.items.length === 1, keptCart.body.data);

    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exit(failed === 0 ? 0 : 1);
    return;
  }

  section('1. Normal checkout - stock drops by exactly the ordered quantity');

  const normal = await newProduct(adminToken, 'normal', 10, true);
  const normalSession = guest('normal');
  const normalAdd = await addToCart(normalSession, normal.id, 2);
  check('a tracked product can be added to the cart', normalAdd.status === 201, normalAdd.body);

  const ordersBeforeNormal = await orderCount(adminToken);
  const normalCheckout = await checkout(normalSession);
  check('checkout succeeds while stock lasts', normalCheckout.status === 201, normalCheckout.body);

  const normalAfter = await readProduct(adminToken, normal.id);
  check('stock drops by exactly the ordered quantity', normalAfter.stock === 8, normalAfter);
  check('the sales counter moves with the stock', normalAfter.soldCount === 2, normalAfter);
  check('exactly one order was created', (await orderCount(adminToken)) - ordersBeforeNormal === 1);

  section('2. Insufficient stock - refused, stock untouched');

  const short = await newProduct(adminToken, 'short', 5, true);
  const shortSession = guest('short');
  await addToCart(shortSession, short.id, 4);
  await setStock(adminToken, short.id, 1); // someone else bought the rest in the meantime

  const ordersBeforeShort = await orderCount(adminToken);
  const shortCheckout = await checkout(shortSession);
  check(
    'checkout is refused when the stock ran out',
    shortCheckout.status === 400 || shortCheckout.status === 409,
    shortCheckout.body,
  );

  const shortAfter = await readProduct(adminToken, short.id);
  check('a refused checkout leaves stock untouched', shortAfter.stock === 1 && shortAfter.soldCount === 0, shortAfter);
  check('a refused checkout creates no order', (await orderCount(adminToken)) - ordersBeforeShort === 0);

  section('3. Duplicate lines of one product - validated in total');

  const split = await newProduct(adminToken, 'split', 3, true);
  const splitSession = guest('split');
  await addToCart(splitSession, split.id, 2, 'line one');
  await addToCart(splitSession, split.id, 2, 'line two');

  const ordersBeforeSplit = await orderCount(adminToken);
  const splitRefused = await checkout(splitSession);
  check(
    'two lines of 2 cannot get past a stock of 3',
    splitRefused.status === 400 || splitRefused.status === 409,
    splitRefused.body,
  );

  const splitAfter = await readProduct(adminToken, split.id);
  check('no stock moved for the refused basket', splitAfter.stock === 3 && splitAfter.soldCount === 0, splitAfter);
  check('no order was created for the refused basket', (await orderCount(adminToken)) - ordersBeforeSplit === 0);

  await setStock(adminToken, split.id, 4);
  const splitAccepted = await checkout(splitSession);
  check('the same basket succeeds once stock allows it', splitAccepted.status === 201, splitAccepted.body);

  const splitFinal = await readProduct(adminToken, split.id);
  check('all four units are claimed in one go', splitFinal.stock === 0 && splitFinal.soldCount === 4, splitFinal);

  section('4. Concurrent checkout - five buyers, one unit');

  const race = await newProduct(adminToken, 'race', 1, true);
  const buyers = ['b1', 'b2', 'b3', 'b4', 'b5'].map((tag) => guest(`race-${tag}`));
  await Promise.all(buyers.map((session) => addToCart(session, race.id, 1)));

  const ordersBeforeRace = await orderCount(adminToken);
  // Fired together rather than awaited one by one: this is the race the guard must survive.
  const results = await Promise.all(buyers.map((session) => checkout(session)));

  const winners = results.filter((r) => r.status === 201);
  const losers = results.filter((r) => r.status !== 201);
  check('exactly one concurrent checkout wins the last unit', winners.length === 1, results.map((r) => r.status));
  check(
    'every losing checkout is refused with 400/409',
    losers.length === 4 && losers.every((r) => r.status === 400 || r.status === 409),
    results.map((r) => [r.status, r.body?.message]),
  );

  const raceAfter = await readProduct(adminToken, race.id);
  check('stock lands exactly on zero', raceAfter.stock === 0, raceAfter);
  check('stock never went negative', raceAfter.stock >= 0, raceAfter);
  check('exactly one unit was sold', raceAfter.soldCount === 1, raceAfter);
  check('exactly one order was created by the race', (await orderCount(adminToken)) - ordersBeforeRace === 1);

  const losingIndex = results.findIndex((r) => r.status !== 201);
  if (losingIndex >= 0) {
    const losingCart = await call('/cart', { sessionId: buyers[losingIndex] });
    check('a losing checkout leaves its cart untouched', losingCart.body.data.items.length === 1, losingCart.body.data);
  }

  section('5. Untracked product - only the sales counter moves');

  const untracked = await newProduct(adminToken, 'untracked', 0, false);
  const untrackedSession = guest('untracked');
  const untrackedAdd = await addToCart(untrackedSession, untracked.id, 2);
  check('an untracked product is always addable', untrackedAdd.status === 201, untrackedAdd.body);

  const untrackedCheckout = await checkout(untrackedSession);
  check('an untracked product can be checked out', untrackedCheckout.status === 201, untrackedCheckout.body);

  const untrackedAfter = await readProduct(adminToken, untracked.id);
  check('stock stays untouched for an untracked product', untrackedAfter.stock === 0, untrackedAfter);
  check('the sales counter still moves', untrackedAfter.soldCount === 2, untrackedAfter);

  section('6. Transactions available - checkout is not refused');

  const live = await newProduct(adminToken, 'live', 2, true);
  const liveSession = guest('live');
  await addToCart(liveSession, live.id, 1);
  const liveCheckout = await checkout(liveSession);
  check('checkout is not refused on a transactional deployment', liveCheckout.status === 201, liveCheckout.body);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Module scope on purpose: `smoke.ts` is a plain script, so without this export
 * the two files would declare the same top-level names (BASE, call, check, ...)
 * and TypeScript would report duplicate declarations in both.
 */
export {};
