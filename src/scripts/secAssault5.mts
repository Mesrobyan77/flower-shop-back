/* eslint-disable no-console */
/**
 * Phase 5: does anything an operator writes on an order reach the customer?
 *
 * The same content is read back through every customer-facing door: the member order
 * view, the member order list, the guest lookup, and the payment return page. Each one
 * is fetched after an admin has written an admin note and a status-change note.
 *
 *   SMOKE_API=http://localhost:5050/api npx tsx src/scripts/secAssault5.mts
 */
const BASE = process.env.SMOKE_API ?? 'http://localhost:5050/api';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@anahit-flower.am';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!';
const PW = 'AuditPass1!x';
const RUN = Date.now();
const ADMIN_NOTE = `INTERNAL-courier-invoice-${RUN}`;
const STATUS_NOTE = `INTERNAL-warehouse-prioritise-${RUN}`;
const REJECT_NOTE = `INTERNAL-rejected-because-${RUN}`;

let adminToken = '';
let deliveryDate = '';
let timeSlot = '';

async function call(path: string, opts: { method?: string; body?: unknown; token?: string; sessionId?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.sessionId) headers['X-Session-Id'] = opts.sessionId;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, { method: opts.method ?? 'GET', headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  return { status: res.status, json: (await res.json().catch(() => undefined)) as any };
}

function verdict(id: string, severity: string, title: string, exploited: boolean, detail: string) {
  console.log(`${exploited ? 'EXPLOITED' : 'BLOCKED '} [${id}] (${severity}) ${title} :: ${detail}`);
}

async function main() {
  const login = await call('/auth/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  if (login.status !== 200) throw new Error(`admin login failed ${login.status}`);
  adminToken = login.json.data.accessToken;

  const options = await call('/delivery/options');
  const quick = options.json.data.methods.find((m: any) => m.method === 'quick');
  deliveryDate = quick.calendar.find((d: any) => d.available).date;
  timeSlot = quick.timeSlots[0];

  const categories = await call('/admin/categories', { token: adminToken });
  const categoryId = categories.json.data.find((c: any) => c.code === '00010001')?.id;
  const product = (await call('/admin/products', {
    method: 'POST',
    token: adminToken,
    body: {
      name: { hy: 'Note check', en: 'Note check', ru: 'Note check' },
      category: categoryId,
      price: 4000,
      deliveryMethods: ['quick', 'parcel'],
      images: [{ url: '/images/seed/bouquet-01.svg', order: 1 }],
      stock: 30,
      trackStock: true,
      isActive: true,
    },
  })).json.data as { id: string };

  console.log(`\n=== PHASE 5  ${BASE} ===`);

  /* ------------------------------------------------ member-owned order */
  const email = `s5.member.${RUN}@example.test`;
  const reg = await call('/auth/register', { method: 'POST', body: { email, password: PW, name: 'Note Owner', agreeTerms: true } });
  const token = reg.json.data.accessToken as string;

  await call('/cart/items', { method: 'POST', token, body: { productId: product.id, quantity: 1, deliveryMethod: 'quick', deliveryDate, timeSlot } });
  const memberCheckout = await call('/orders/checkout', { method: 'POST', token, body: {
    customer: { name: 'Note Owner', email, phone: '+374 99 111222' },
    delivery: { method: 'quick', recipient: 'Mariam', phone: '+374 91 000000', region: 'yerevan', city: 'Yerevan', street: 'Hanrapetutyan 25', requestedDate: deliveryDate, timeSlot },
    agreeTerms: true,
  } });
  const memberOrder = memberCheckout.json?.data?.order;
  const memberId = memberOrder?.id;

  const noteSet = await call(`/admin/orders/${memberId}/note`, { method: 'PATCH', token: adminToken, body: { adminNote: ADMIN_NOTE } });
  const statusSet = await call(`/admin/orders/${memberId}/status`, { method: 'PATCH', token: adminToken, body: { status: 'confirmed', note: STATUS_NOTE } });

  const detail = await call(`/orders/${memberId}`, { token });
  const list = await call('/orders?limit=20', { token });
  const memberLeaks = [ADMIN_NOTE, STATUS_NOTE, REJECT_NOTE].filter((needle) => JSON.stringify(detail.json ?? {}).includes(needle));
  const listLeaks = [ADMIN_NOTE, STATUS_NOTE].filter((needle) => JSON.stringify(list.json ?? {}).includes(needle));
  verdict('S-44', 'MEDIUM', 'operator-only order notes reach the owning customer',
    memberLeaks.length > 0 || listLeaks.length > 0,
    `checkout ${memberCheckout.status}, note ${noteSet.status}, status ${statusSet.status}; GET /orders/:id ${detail.status} leaked [${memberLeaks.join(', ')}]; GET /orders ${list.status} leaked [${listLeaks.join(', ')}]`);

  const detailKeys = Object.keys(detail.json?.data?.order ?? detail.json?.data ?? {});
  const history = (detail.json?.data?.order ?? detail.json?.data)?.statusHistory;
  console.log(`  customer view fields: ${detailKeys.join(', ')}`);
  console.log(`  statusHistory as returned: ${JSON.stringify(history)}`);

  /* ------------------------------------------------------ guest order */
  const guestSession = `s5-guest-${RUN}`;
  const guestEmail = `s5.guest.${RUN}@example.test`;
  await call('/cart/items', { method: 'POST', sessionId: guestSession, body: { productId: product.id, quantity: 1, deliveryMethod: 'quick', deliveryDate, timeSlot } });
  const guestCheckout = await call('/orders/checkout', { method: 'POST', sessionId: guestSession, body: {
    customer: { name: 'Guest Owner', email: guestEmail, phone: '+374 99 111222' },
    delivery: { method: 'quick', recipient: 'Mariam', phone: '+374 91 000000', region: 'yerevan', city: 'Yerevan', street: 'Hanrapetutyan 25', requestedDate: deliveryDate, timeSlot },
    agreeTerms: true,
  } });
  const guestOrder = guestCheckout.json?.data?.order;
  await call(`/admin/orders/${guestOrder?.id}/note`, { method: 'PATCH', token: adminToken, body: { adminNote: ADMIN_NOTE } });
  await call(`/admin/orders/${guestOrder?.id}/status`, { method: 'PATCH', token: adminToken, body: { status: 'packed', note: STATUS_NOTE } });

  const lookup = await call('/orders/lookup', { method: 'POST', sessionId: guestSession, body: { code: guestOrder?.code, email: guestEmail } });
  const lookupLeaks = [ADMIN_NOTE, STATUS_NOTE].filter((needle) => JSON.stringify(lookup.json ?? {}).includes(needle));
  verdict('S-44c', 'MEDIUM', 'operator notes reach the guest order lookup',
    lookupLeaks.length > 0, `lookup ${lookup.status} leaked [${lookupLeaks.join(', ')}] for ${guestOrder?.code}`);

  const wrongEmail = await call('/orders/lookup', { method: 'POST', sessionId: guestSession, body: { code: guestOrder?.code, email: `s5.notowner.${RUN}@example.test` } });
  verdict('S-49', 'HIGH', 'a guest order is readable by code alone',
    wrongEmail.status === 200, `correct pair ${lookup.status}, code + wrong email ${wrongEmail.status}`);

  /* ------------------------------- deactivated account still transacting */
  const offEmail = `s5.off.${RUN}@example.test`;
  const offReg = await call('/auth/register', { method: 'POST', body: { email: offEmail, password: PW, name: 'Off User', agreeTerms: true } });
  await call('/cart/items', { method: 'POST', token: offReg.json.data.accessToken, body: { productId: product.id, quantity: 1, deliveryMethod: 'quick', deliveryDate, timeSlot } });
  await call(`/admin/users/${offReg.json.data.user.id}/active`, { method: 'PATCH', token: adminToken, body: { isActive: false } });
  const offCheckout = await call('/orders/checkout', { method: 'POST', token: offReg.json.data.accessToken, body: {
    customer: { name: 'Off User', email: offEmail, phone: '+374 99 111222' },
    delivery: { method: 'quick', recipient: 'Mariam', phone: '+374 91 000000', region: 'yerevan', city: 'Yerevan', street: 'Hanrapetutyan 25', requestedDate: deliveryDate, timeSlot },
    agreeTerms: true,
  } });
  const offReview = await call('/reviews', { method: 'POST', token: offReg.json.data.accessToken, body: { product: product.id, rating: 5, title: 'from a disabled account', body: 'still allowed?' } });

  /* control: the same request from an active account must still work */
  const onEmail = `s5.on.${RUN}@example.test`;
  const onReg = await call('/auth/register', { method: 'POST', body: { email: onEmail, password: PW, name: 'On User', agreeTerms: true } });
  const onReview = await call('/reviews', { method: 'POST', token: onReg.json.data.accessToken, body: { product: product.id, rating: 5, title: 'from an active account', body: 'the probe itself is valid' } });

  verdict('S-50', 'HIGH', 'a deactivated account can still place orders and publish content',
    offCheckout.status === 201 || offReview.status === 201,
    `checkout ${offCheckout.status}, review ${offReview.status}; active-account review control ${onReview.status}`);

  await call(`/admin/products/${product.id}`, { method: 'DELETE', token: adminToken });
  console.log('\nphase 5 done');
}

main().catch((e) => {
  console.error('harness error:', (e as Error).message);
  process.exit(1);
});
