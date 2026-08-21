/* eslint-disable no-console */
/**
 * End-to-end smoke test against a running API.
 *
 * Walks the real customer journey - browse, add to cart with options, check out
 * as cash on delivery - then the admin journey - move the order along its status
 * chain and confirm the side effects (stock, points, grade).
 *
 * Run the API first (npm run dev:memory), then: npm run smoke
 */
const BASE = process.env.SMOKE_API ?? 'http://localhost:5000/api';

let passed = 0;
let failed = 0;
const cookies = new Map<string, string>();

function cookieHeader() {
  return [...cookies.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
}

function storeCookies(response: Response) {
  const raw = response.headers.getSetCookie?.() ?? [];
  for (const line of raw) {
    const [pair] = line.split(';');
    const index = pair.indexOf('=');
    if (index > 0) cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
  }
}

interface CallOptions {
  method?: string;
  body?: unknown;
  token?: string;
}

async function call<T = any>(path: string, options: CallOptions = {}): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const cookie = cookieHeader();
  if (cookie) headers.Cookie = cookie;

  const response = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  storeCookies(response);
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}`);
    if (detail !== undefined) console.log('        ', JSON.stringify(detail).slice(0, 300));
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

async function main() {
  section('Public catalogue');

  const health = await call('/health');
  check('health responds', health.status === 200 && health.body.data.status === 'ok', health.body);

  const config = await call('/config');
  check('config exposes AMD currency', config.body.data.currency.code === 'AMD', config.body);
  check('config exposes member grades', config.body.data.grades.length === 7);

  const categories = await call('/categories');
  check('category tree is nested', categories.body.data.some((c: any) => c.children.length > 0));
  check('categories use id, never _id', !JSON.stringify(categories.body.data).includes('"_id"'));
  check('parent counts include descendants', categories.body.data[0].productCount > 0, categories.body.data[0]);

  const products = await call('/products?limit=5');
  check('product listing paginates', products.body.data.length === 5 && products.body.meta.pagination.total > 5);
  check('products use id, never _id', !JSON.stringify(products.body.data).includes('"_id"'));

  const sorted = await call('/products?sort=price_asc&limit=3');
  const prices = sorted.body.data.map((p: any) => p.price);
  check('price sort ascends', prices[0] <= prices[1] && prices[1] <= prices[2], prices);

  const searched = await call('/products?q=roses');
  check('search returns matches', searched.body.data.length > 0);

  const filtered = await call('/products?category=flower-gifts&limit=50');
  check('category filter includes descendants', filtered.body.data.length > 0);

  const slug = products.body.data[0].slug;
  const detail = await call(`/products/${slug}`);
  check('product detail carries breadcrumb', detail.body.data.breadcrumb.length >= 1);
  check('product detail carries delivery calendars', detail.body.data.delivery.length > 0, detail.body.data.delivery);

  const quick = detail.body.data.delivery.find((d: any) => d.method === 'quick');
  if (quick) {
    check('quick delivery offers time slots', quick.timeSlots.length > 0);
    check('quick slots stay inside 10:00-20:00', quick.timeSlots[0] >= '10:00' && quick.timeSlots.at(-1) <= '20:00');
  }
  const parcel = detail.body.data.delivery.find((d: any) => d.method === 'parcel');
  if (parcel) check('parcel offers no time slots', parcel.timeSlots.length === 0);

  section('Delivery rules');

  const options = await call('/delivery/options');
  check('region matrix is exposed', options.body.data.regions.length === 11);

  const quoteRemote = await call('/delivery/quote?method=parcel&region=syunik&subtotal=1000');
  check('remote marz adds a surcharge', quoteRemote.body.data.surcharge > 0, quoteRemote.body.data);

  const quoteFree = await call('/delivery/quote?method=parcel&region=ararat&subtotal=99000');
  check('parcel is free above the threshold', quoteFree.body.data.isFree && quoteFree.body.data.fee === 0);

  const quickInRegion = await call('/delivery/quote?method=quick&region=shirak&subtotal=1000');
  check('express is refused outside its zone', quickInRegion.status === 400, quickInRegion.body);

  section('Registration and guest cart merge');

  const email = `smoke_${Date.now()}@example.com`;

  const guestCart = await call('/cart');
  check('guest cart is created lazily', guestCart.status === 200 && guestCart.body.data.items.length === 0);

  const target = detail.body.data.product;
  const addon = target.optionGroups.find((g: any) => g.type === 'select' && g.key !== 'delivery_method');
  const addonChoice = addon?.options?.[0];
  const deliveryDate = quick?.calendar.find((d: any) => d.available)?.date;

  const addGuest = await call('/cart/items', {
    method: 'POST',
    body: {
      productId: target.id,
      quantity: 2,
      deliveryMethod: 'quick',
      deliveryDate,
      timeSlot: quick?.timeSlots[0],
      ribbonText: 'Happy birthday',
      options: addonChoice ? [{ groupKey: addon.key, optionKey: addonChoice.key }] : [],
    },
  });
  check('guest can add to cart', addGuest.status === 201, addGuest.body);

  const guestTotal = addGuest.body.data.totals.merchandiseTotal;
  const expected = (target.price + (addonChoice?.priceDelta ?? 0)) * 2;
  check('option surcharge is applied per unit', guestTotal === expected, { guestTotal, expected });

  const register = await call('/auth/register', {
    method: 'POST',
    body: { email, password: 'Secret123', name: 'Smoke Tester', phone: '+374 99 111222', agreeTerms: true },
  });
  check('registration succeeds', register.status === 201, register.body);
  const token = register.body.data.accessToken;

  const login = await call('/auth/login', { method: 'POST', body: { email, password: 'Secret123' } });
  check('login succeeds', login.status === 200);
  const authToken = login.body.data.accessToken;

  const mergedCart = await call('/cart', { token: authToken });
  check('guest cart merges into the member cart', mergedCart.body.data.items.length === 1, mergedCart.body.data);

  section('Validation');

  const badLogin = await call('/auth/login', { method: 'POST', body: { email, password: 'wrong-password' } });
  check('wrong password is rejected', badLogin.status === 401);

  const badRegister = await call('/auth/register', {
    method: 'POST',
    body: { email, password: 'short', name: 'X', agreeTerms: true },
  });
  check('weak password fails validation', badRegister.status === 422, badRegister.body);
  check('field errors are returned', Boolean(badRegister.body.errors?.password), badRegister.body.errors);

  const noAuth = await call('/account/summary');
  check('protected route rejects anonymous access', noAuth.status === 401);

  const notAdmin = await call('/admin/stats', { token: authToken });
  check('admin route rejects a normal user', notAdmin.status === 403, notAdmin.body);

  section('Checkout - cash on delivery');

  const emptyTerms = await call('/orders/checkout', {
    method: 'POST',
    token: authToken,
    body: {
      customer: { name: 'Smoke Tester', email, phone: '+374 99 111222' },
      delivery: {
        method: 'quick',
        recipient: 'Mariam',
        phone: '+374 91 000000',
        region: 'yerevan',
        city: 'Yerevan',
        street: 'Hanrapetutyan 25',
        requestedDate: deliveryDate,
        timeSlot: quick?.timeSlots[0],
      },
      agreeTerms: false,
    },
  });
  check('checkout requires accepting the terms', emptyTerms.status === 422 || emptyTerms.status === 400);

  const wrongRegion = await call('/orders/checkout', {
    method: 'POST',
    token: authToken,
    body: {
      customer: { name: 'Smoke Tester', email, phone: '+374 99 111222' },
      delivery: {
        method: 'quick',
        recipient: 'Mariam',
        phone: '+374 91 000000',
        region: 'shirak',
        city: 'Gyumri',
        street: 'Abovyan 1',
        requestedDate: deliveryDate,
      },
      agreeTerms: true,
    },
  });
  check('express outside its zone is refused at checkout', wrongRegion.status === 400, wrongRegion.body);

  const checkout = await call('/orders/checkout', {
    method: 'POST',
    token: authToken,
    body: {
      customer: { name: 'Smoke Tester', email, phone: '+374 99 111222' },
      delivery: {
        method: 'quick',
        recipient: 'Mariam',
        phone: '+374 91 000000',
        region: 'yerevan',
        city: 'Yerevan',
        street: 'Hanrapetutyan 25',
        building: '3',
        apartment: '12',
        requestedDate: deliveryDate,
        timeSlot: quick?.timeSlots[0],
      },
      customerNote: 'Smoke test order',
      agreeTerms: true,
    },
  });
  check('checkout creates the order', checkout.status === 201, checkout.body);

  const order = checkout.body.data;
  check('payment method is cash on delivery', order.paymentMethod === 'cash_on_delivery');
  check('payment starts unpaid', order.paymentStatus === 'pending');
  check('order starts pending', order.status === 'pending');
  check('order carries a quotable code', /^XF-\d{8}-[0-9A-Z]{5}$/.test(order.code), order.code);
  check('delivery fee is charged for express', order.deliveryFee > 0, order.deliveryFee);
  check('ribbon text survives into the order', order.items[0].ribbonText === 'Happy birthday');
  check('order total is subtotal + options + delivery', order.total === order.subtotal + order.optionsTotal + order.deliveryFee - order.gradeDiscount - order.pointsUsed, order);

  const emptiedCart = await call('/cart', { token: authToken });
  check('cart is emptied after checkout', emptiedCart.body.data.items.length === 0);

  const lookup = await call('/orders/lookup', { method: 'POST', body: { code: order.code, email } });
  check('guest lookup finds the order', lookup.status === 200 && lookup.body.data.code === order.code);

  const badLookup = await call('/orders/lookup', { method: 'POST', body: { code: order.code, email: 'nope@example.com' } });
  check('guest lookup rejects the wrong email', badLookup.status === 404);

  section('Admin flow');

  const adminLogin = await call('/auth/login', {
    method: 'POST',
    body: { email: process.env.SEED_ADMIN_EMAIL ?? 'admin@xch-flower.am', password: process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!' },
  });
  check('admin signs in', adminLogin.status === 200, adminLogin.body);
  const adminToken = adminLogin.body.data.accessToken;

  const stats = await call('/admin/stats', { token: adminToken });
  check('dashboard stats load', stats.status === 200 && stats.body.data.totals.orders > 0);

  const adminOrders = await call('/admin/orders?limit=5', { token: adminToken });
  check('admin lists orders', adminOrders.body.data.length > 0);

  const orderId = order.id;

  const illegalJump = await call(`/admin/orders/${orderId}/status`, {
    method: 'PATCH',
    token: adminToken,
    body: { status: 'delivered' },
  });
  check('status transitions cannot skip steps', illegalJump.status === 400, illegalJump.body);

  for (const next of ['confirmed', 'preparing', 'delivering', 'delivered']) {
    const step = await call(`/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      token: adminToken,
      body: { status: next },
    });
    check(`status moves to ${next}`, step.status === 200 && step.body.data.status === next, step.body);
  }

  const delivered = await call(`/admin/orders/${orderId}`, { token: adminToken });
  check('cash is recorded as paid on delivery', delivered.body.data.paymentStatus === 'paid', delivered.body.data);

  const completed = await call(`/admin/orders/${orderId}/status`, {
    method: 'PATCH',
    token: adminToken,
    body: { status: 'completed' },
  });
  check('order completes', completed.body.data.status === 'completed');

  const me = await call('/auth/me', { token: authToken });
  check('points are credited on completion', me.body.data.points > 0, me.body.data);
  check('lifetime spend is recorded', me.body.data.totalSpend === order.total, me.body.data);

  section('Admin CRUD');

  const categoriesAdmin = await call('/admin/categories', { token: adminToken });
  const categoryId = categoriesAdmin.body.data.find((c: any) => c.code === '00010001')?.id;

  const created = await call('/admin/products', {
    method: 'POST',
    token: adminToken,
    body: {
      name: { hy: 'Smoke ապրանք', en: 'Smoke product', ru: 'Smoke товар' },
      category: categoryId,
      price: 12345,
      deliveryMethods: ['parcel'],
      images: [{ url: '/images/seed/bouquet-01.svg', order: 1 }],
    },
  });
  check('admin creates a product', created.status === 201, created.body);

  const updated = await call(`/admin/products/${created.body.data.id}`, {
    method: 'PATCH',
    token: adminToken,
    body: { price: 15000, isActive: false },
  });
  check('admin updates a product', updated.body.data.price === 15000);

  const hidden = await call(`/products/${created.body.data.slug}`);
  check('inactive products vanish from the storefront', hidden.status === 404);

  const removed = await call(`/admin/products/${created.body.data.id}`, { method: 'DELETE', token: adminToken });
  check('admin deletes a product', removed.status === 204);

  const settings = await call('/admin/settings', { token: adminToken });
  check('settings load for the admin', settings.status === 200);

  section('Content');

  const posts = await call('/posts?type=faq');
  check('FAQ entries are published', posts.body.data.length > 0);

  const plans = await call('/subscription-plans');
  check('subscription plans are published', plans.body.data.length === 3);

  const subscribed = await call('/account/subscriptions', {
    method: 'POST',
    token: authToken,
    body: {
      planId: plans.body.data[0].id,
      cycle: plans.body.data[0].cycle,
      recipient: 'Mariam',
      phone: '+374 91 000000',
      region: 'yerevan',
      city: 'Yerevan',
      street: 'Hanrapetutyan 25',
    },
  });
  check('customer subscribes to a plan', subscribed.status === 201, subscribed.body);

  const paused = await call(`/account/subscriptions/${subscribed.body.data.id}/pause`, {
    method: 'POST',
    token: authToken,
  });
  check('subscription can be paused', paused.body.data.status === 'paused');

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
