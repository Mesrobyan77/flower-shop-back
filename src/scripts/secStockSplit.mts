/* eslint-disable no-console */
/**
 * Focused reproduction: can two cart lines of the same product together claim more
 * units than the product holds?
 *
 * The stock harness' scenario 3 builds the over-sized basket at add time, which the
 * cart's own availability guard refuses before checkout, so it no longer proves what
 * it was written to prove. This script puts the basket together while stock lasts and
 * only then cuts the stock, which is what a real double-order attempt looks like.
 *
 *   SMOKE_API=http://localhost:5050/api npx tsx src/scripts/secStockSplit.mts
 */
const BASE = process.env.SMOKE_API ?? 'http://localhost:5050/api';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@anahit-flower.am';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!';

let token = '';
const runTag = Date.now();

async function call(path: string, options: { method?: string; body?: unknown; sessionId?: string } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.sessionId) headers['X-Session-Id'] = options.sessionId;
  const res = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const body = await res.json().catch(() => undefined);
  return { status: res.status, body: body as any };
}

function say(label: string, okCondition: boolean, detail?: unknown) {
  console.log(`  ${okCondition ? 'PASS' : 'FAIL'}  ${label}${okCondition || detail === undefined ? '' : ` ${JSON.stringify(detail).slice(0, 240)}`}`);
}

async function main() {
  const login = await call('/auth/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  if (login.status !== 200) throw new Error(`admin login failed ${login.status}`);
  token = login.body.data.accessToken as string;

  const categories = await call('/admin/categories');
  const categoryId = categories.body.data.find((c: any) => c.code === '00010001')?.id;
  const calendar = await call('/delivery/options');
  const quick = calendar.body.data.methods.find((m: any) => m.method === 'quick');
  const deliveryDate = quick.calendar.find((d: any) => d.available).date;
  const timeSlot = quick.timeSlots[0];

  const created = await call('/admin/products', {
    method: 'POST',
    body: {
      name: { hy: 'Split check', en: 'Split check', ru: 'Split check' },
      category: categoryId,
      price: 1000,
      deliveryMethods: ['quick', 'parcel'],
      images: [{ url: '/images/seed/bouquet-01.svg', order: 1 }],
      stock: 10,
      trackStock: true,
      isActive: true,
    },
  });
  const product = created.body.data as { id: string };
  console.log(`\naggregate stock claim across duplicate lines (${product.id})`);

  const session = `sec-split-${runTag}`;
  const first = await call('/cart/items', {
    method: 'POST',
    sessionId: session,
    body: { productId: product.id, quantity: 2, deliveryMethod: 'quick', deliveryDate, timeSlot, ribbonText: 'line one' },
  });
  const second = await call('/cart/items', {
    method: 'POST',
    sessionId: session,
    body: { productId: product.id, quantity: 2, deliveryMethod: 'quick', deliveryDate, timeSlot, ribbonText: 'line two' },
  });
  say('two lines of two are accepted while stock lasts', first.status === 201 && second.status === 201, [first.status, second.status]);

  const cart = await call('/cart', { sessionId: session });
  const lines = cart.body.data.items as any[];
  say('the basket holds two separate lines totalling 4 units', lines.length === 2 && lines.reduce((a, l) => a + l.quantity, 0) === 4, lines.map((l) => [l.quantity, l.ribbonText]));

  await call(`/admin/products/${product.id}`, { method: 'PATCH', body: { stock: 3 } });

  const ordersBefore = await call('/admin/stats');
  const refused = await call('/orders/checkout', {
    method: 'POST',
    sessionId: session,
    body: {
      customer: { name: 'Split Tester', email: `split_${runTag}@example.com`, phone: '+374 99 111222' },
      delivery: { method: 'quick', recipient: 'Mariam', phone: '+374 91 000000', region: 'yerevan', city: 'Yerevan', street: 'Hanrapetutyan 25', requestedDate: deliveryDate, timeSlot },
      agreeTerms: true,
    },
  });
  say('a 4-unit basket is refused when only 3 remain', refused.status === 400 || refused.status === 409, [refused.status, refused.body?.message]);

  const afterRefusal = await call(`/admin/products/${product.id}`);
  say('the refused basket moves no stock', afterRefusal.body.data.stock === 3 && afterRefusal.body.data.soldCount === 0, afterRefusal.body.data);
  const ordersAfterRefusal = await call('/admin/stats');
  say('the refused basket creates no order', ordersAfterRefusal.body.data.totals.orders === ordersBefore.body.data.totals.orders);

  const basketSurvives = await call('/cart', { sessionId: session });
  say('the basket survives the refusal', (basketSurvives.body.data.items ?? []).length === 2, basketSurvives.body.data);

  await call(`/admin/products/${product.id}`, { method: 'PATCH', body: { stock: 4 } });
  const accepted = await call('/orders/checkout', {
    method: 'POST',
    sessionId: session,
    body: {
      customer: { name: 'Split Tester', email: `split_${runTag}@example.com`, phone: '+374 99 111222' },
      delivery: { method: 'quick', recipient: 'Mariam', phone: '+374 91 000000', region: 'yerevan', city: 'Yerevan', street: 'Hanrapetutyan 25', requestedDate: deliveryDate, timeSlot },
      agreeTerms: true,
    },
  });
  say('the same basket succeeds once 4 units are available', accepted.status === 201, [accepted.status, accepted.body?.message]);

  const finalProduct = await call(`/admin/products/${product.id}`);
  say('all four units are claimed by one aggregate decrement', finalProduct.body.data.stock === 0 && finalProduct.body.data.soldCount === 4, finalProduct.body.data);

  const order = accepted.body.data?.order;
  say('the order totals the whole basket', typeof order?.total === 'number' && order.items.length === 2, { total: order?.total, lines: order?.items?.length });

  /* the same basket replayed against an empty product */
  const replay = await call('/orders/checkout', {
    method: 'POST',
    sessionId: session,
    body: {
      customer: { name: 'Split Tester', email: `split_${runTag}@example.com`, phone: '+374 99 111222' },
      delivery: { method: 'quick', recipient: 'Mariam', phone: '+374 91 000000', region: 'yerevan', city: 'Yerevan', street: 'Hanrapetutyan 25', requestedDate: deliveryDate, timeSlot },
      agreeTerms: true,
    },
  });
  say('an emptied basket cannot be replayed', replay.status === 400, [replay.status, replay.body?.message]);

  const after = await call(`/admin/products/${product.id}`);
  say('the replay claimed nothing further', after.body.data.stock === 0 && after.body.data.soldCount === 4, after.body.data);

  await call(`/admin/products/${product.id}`, { method: 'DELETE' });
  const gone = await call(`/admin/products/${product.id}`);
  console.log(`\ncleanup: test product delete -> ${gone.status}`);
}

main().catch((e) => {
  console.error('harness error:', (e as Error).message);
  process.exit(1);
});
