/* eslint-disable no-console */
/**
 * Phase 4: admin-dependent authorisation, race, and the upload attack matrix.
 *
 * Runs against the in-memory stack only (it needs an admin account and it creates
 * orders, cancellations and upload attempts):
 *
 *   PORT=5050 NODE_ENV=test npm run dev:memory
 *   SMOKE_API=http://localhost:5050/api npx tsx src/scripts/secAssault4.mts
 *
 * Cloudinary is deliberately configured with unusable credentials in this stack, so
 * nothing is ever written to the real media account. That is what makes the upload
 * proof readable: a payload refused by validation reports a different code from a
 * payload that passed validation and was handed to the storage client.
 */
import path from 'path';
import { slugify } from '../utils/slug';

const BASE = process.env.SMOKE_API ?? 'http://localhost:5050/api';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@anahit-flower.am';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!';
const PW = 'AuditPass1!x';
const RUN = Date.now();

let adminToken = '';
let deliveryDate = '';
let timeSlot = '';

async function call(path: string, opts: { method?: string; body?: unknown; token?: string; sessionId?: string; form?: FormData; cookie?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.sessionId) headers['X-Session-Id'] = opts.sessionId;
  if (opts.cookie) headers.Cookie = opts.cookie;
  let payload: BodyInit | undefined;
  if (opts.form) payload = opts.form;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(opts.body);
  }
  const res = await fetch(`${BASE}${path}`, { method: opts.method ?? 'GET', headers, body: payload });
  const json = await res.json().catch(() => undefined as any);
  return { status: res.status, json: json as any, setCookie: res.headers.getSetCookie?.() ?? [] };
}

function verdict(id: string, severity: string, title: string, exploited: boolean, detail: string) {
  console.log(`${exploited ? 'EXPLOITED' : 'BLOCKED '} [${id}] (${severity}) ${title} :: ${detail}`);
}

function note(id: string, severity: string, title: string, detail: string) {
  console.log(`NOTED      [${id}] (${severity}) ${title} :: ${detail}`);
}

async function register(email: string) {
  const res = await call('/auth/register', {
    method: 'POST',
    body: { email, password: PW, name: 'Audit Member', agreeTerms: true },
  });
  return { status: res.status, token: res.json?.data?.accessToken as string | undefined, id: res.json?.data?.user?.id as string | undefined };
}

async function newProduct(stock: number, label: string) {
  const categories = await call('/admin/categories', { token: adminToken });
  const categoryId = categories.json.data.find((c: any) => c.code === '00010001')?.id;
  const created = await call('/admin/products', {
    method: 'POST',
    token: adminToken,
    body: {
      name: { hy: `Audit ${label}`, en: `Audit ${label}`, ru: `Audit ${label}` },
      category: categoryId,
      price: 5000,
      deliveryMethods: ['quick', 'parcel'],
      images: [{ url: '/images/seed/bouquet-01.svg', order: 1 }],
      stock,
      trackStock: true,
      isActive: true,
    },
  });
  return created.json.data as { id: string; slug: string };
}

async function uploadAttempt(file: { name: string; type: string; bytes: Uint8Array }, token: string, extra: Record<string, string> = {}) {
  const form = new FormData();
  const blob = new Blob([file.bytes], { type: file.type });
  form.append('files', blob, file.name);
  for (const [key, value] of Object.entries(extra)) form.append(key, value);
  const res = await fetch(`${BASE}/admin/media/upload`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
  const json = await res.json().catch(() => undefined as any);
  return { status: res.status, code: json?.code as string | undefined, message: String(json?.message ?? '') };
}

const text = (s: string) => new TextEncoder().encode(s);
const PNG_MAGIC = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const GIF_MAGIC = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);

function concat(...parts: Uint8Array[]) {
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

async function main() {
  const login = await call('/auth/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  if (login.status !== 200) throw new Error(`admin login failed ${login.status}`);
  adminToken = login.json.data.accessToken;

  const options = await call('/delivery/options');
  const quick = options.json.data.methods.find((m: any) => m.method === 'quick');
  deliveryDate = quick.calendar.find((d: any) => d.available).date;
  timeSlot = quick.timeSlots[0];

  console.log(`\n=== PHASE 4  ${BASE} ===`);

  /* ---------------------------------------------------------------- S-42 deactivated account */
  const member = await register(`s4.victim.${RUN}@example.test`);
  const memberLogin = await call('/auth/login', { method: 'POST', body: { email: `s4.victim.${RUN}@example.test`, password: PW } });
  const memberCookie = memberLogin.setCookie.map((line) => line.split(';')[0]).join('; ');
  const deactivate = await call(`/admin/users/${member.id}/active`, { method: 'PATCH', token: adminToken, body: { isActive: false } });
  const reuseAccess = await call('/auth/me', { token: member.token });
  const reuseCart = await call('/cart', { token: member.token });
  const reuseOrders = await call('/orders', { token: member.token });
  const refreshAfterDeactivate = await call('/auth/refresh', { method: 'POST', cookie: memberCookie });
  verdict('S-42', 'HIGH', 'a deactivated account keeps using an already-issued access token',
    reuseAccess.status === 200 || reuseCart.status === 200 || reuseOrders.status === 200,
    `deactivate ${deactivate.status}; /auth/me ${reuseAccess.status}, /cart ${reuseCart.status}, /orders ${reuseOrders.status}, POST /auth/refresh (cookie) ${refreshAfterDeactivate.status}`);
  const reactivated = await call(`/admin/users/${member.id}/active`, { method: 'PATCH', token: adminToken, body: { isActive: true } });
  const accessAfterReactivation = await call('/auth/me', { token: member.token });
  verdict('S-42b', 'LOW', 'reactivating an account does not restore it',
    accessAfterReactivation.status !== 200, `reactivate ${reactivated.status}, /auth/me ${accessAfterReactivation.status}`);

  /* ------------------------------------------------------------------ S-43 admin-only user writes */
  const escalate = await call(`/admin/users/${member.id}/role`, { method: 'PATCH', token: member.token, body: { role: 'admin' } });
  const selfRole = await call('/auth/me', { method: 'PATCH', token: member.token, body: { role: 'admin', isActive: true } });
  const roleNow = await call(`/admin/users/${member.id}`, { token: adminToken });
  verdict('S-43', 'HIGH', 'a member promotes themselves to admin through an API call',
    escalate.status < 400 || roleNow.json?.data?.role === 'admin',
    `admin route ${escalate.status}; PATCH /auth/me ${selfRole.status}; stored role is now ${roleNow.json?.data?.role}`);

  /* ------------------------------------------------------- S-44 order note / status history exposure */
  const product = await newProduct(20, 'orders');
  const session = `s4-orders-${RUN}`;
  await call('/cart/items', { method: 'POST', sessionId: session, body: { productId: product.id, quantity: 1, deliveryMethod: 'quick', deliveryDate, timeSlot } });
  const checkout = await call('/orders/checkout', { method: 'POST', sessionId: session, token: member.token, body: {
    customer: { name: 'Audit Member', email: `s4.victim.${RUN}@example.test`, phone: '+374 99 111222' },
    delivery: { method: 'quick', recipient: 'Mariam', phone: '+374 91 000000', region: 'yerevan', city: 'Yerevan', street: 'Hanrapetutyan 25', requestedDate: deliveryDate, timeSlot },
    agreeTerms: true,
  } });
  const orderId = checkout.json?.data?.order?.id;
  const noteSet = await call(`/admin/orders/${orderId}/note`, { method: 'PATCH', token: adminToken, body: { adminNote: 'INTERNAL: courier invoice 55000, do not show' } });
  const statusSet = await call(`/admin/orders/${orderId}/status`, { method: 'PATCH', token: adminToken, body: { status: 'confirmed', note: 'INTERNAL: warehouse told to prioritise' } });
  const customerView = await call(`/orders/${orderId}`, { token: member.token });
  const rawCustomer = JSON.stringify(customerView.json ?? {});
  const adminNoteLeak = rawCustomer.includes('INTERNAL: courier invoice');
  const statusNoteLeak = rawCustomer.includes('INTERNAL: warehouse told');
  verdict('S-44', 'MEDIUM', 'admin-only order notes reach the customer order view',
    adminNoteLeak || statusNoteLeak,
    `note ${noteSet.status}, status ${statusSet.status}; customer GET ${customerView.status}; adminNote text present=${adminNoteLeak}, statusHistory note text present=${statusNoteLeak}`);

  const otherMember = await register(`s4.other.${RUN}@example.test`);
  const crossOrder = await call(`/orders/${orderId}`, { token: otherMember.token });
  const crossCancel = await call(`/orders/${orderId}/cancel`, { method: 'POST', token: otherMember.token, body: { reason: 'nope' } });
  verdict('S-44b', 'HIGH', 'another signed-in customer reads or cancels someone else’s order',
    crossOrder.status === 200 || crossCancel.status < 400,
    `GET ${crossOrder.status}, POST cancel ${crossCancel.status}`);

  /* --------------------------------------------------------- S-45 delivery fee is not client-derived */
  const quoteLow = await call(`/delivery/quote?method=quick&region=yerevan&subtotal=0`, { sessionId: session });
  const cleanOrder = checkout.json?.data?.order;
  const feeSession = `s4-fee-${RUN}`;
  await call('/cart/items', { method: 'POST', sessionId: feeSession, body: { productId: product.id, quantity: 1, deliveryMethod: 'quick', deliveryDate, timeSlot } });
  const clientFeeCheckout = await call('/orders/checkout', { method: 'POST', sessionId: feeSession, body: {
    customer: { name: 'Fee Tester', email: `s4.fee.${RUN}@example.test`, phone: '+374 99 111222' },
    delivery: { method: 'quick', recipient: 'Mariam', phone: '+374 91 000000', region: 'yerevan', city: 'Yerevan', street: 'Hanrapetutyan 25', requestedDate: deliveryDate, timeSlot },
    agreeTerms: true,
    deliveryFee: 0,
    total: 100,
    subtotal: 100,
    discountAmount: 4900,
    gradeDiscount: 4900,
    pointsUsed: 999999,
    pointsEarned: 999999,
    paymentStatus: 'paid',
    status: 'completed',
    items: [{ productId: product.id, quantity: 500, unitPrice: 1 }],
  } });
  const feeOrder = clientFeeCheckout.json?.data?.order;
  verdict('S-45', 'HIGH', 'a client-supplied fee, discount, status or item list changes what is charged',
    feeOrder?.total !== cleanOrder?.total || feeOrder?.deliveryFee !== cleanOrder?.deliveryFee || feeOrder?.status !== 'pending' || (feeOrder?.items?.length ?? 0) !== 1,
    `server quote ${JSON.stringify(quoteLow.json?.data)}; clean order total=${cleanOrder?.total} fee=${cleanOrder?.deliveryFee}; tampered ${clientFeeCheckout.status} total=${feeOrder?.total} fee=${feeOrder?.deliveryFee} status=${feeOrder?.status} paymentStatus=${feeOrder?.paymentStatus} lines=${feeOrder?.items?.length} pointsUsed=${feeOrder?.pointsUsed}`);

  /* ------------------------------------------------------------- S-46 ten buyers, one unit in stock */
  const last = await newProduct(1, 'race');
  const buyers = Array.from({ length: 10 }, (_, i) => `s4-race-${RUN}-${i}`);
  await Promise.all(buyers.map((s) => call('/cart/items', { method: 'POST', sessionId: s, body: { productId: last.id, quantity: 1, deliveryMethod: 'quick', deliveryDate, timeSlot } })));
  const results = await Promise.all(buyers.map((s, i) => call('/orders/checkout', { method: 'POST', sessionId: s, body: {
    customer: { name: 'Race Tester', email: `s4.race${i}.${RUN}@example.test`, phone: '+374 99 111222' },
    delivery: { method: 'quick', recipient: 'Mariam', phone: '+374 91 000000', region: 'yerevan', city: 'Yerevan', street: 'Hanrapetutyan 25', requestedDate: deliveryDate, timeSlot },
    agreeTerms: true,
  } })));
  const winners = results.filter((r) => r.status === 201).length;
  const codes = results.map((r) => r.status);
  const raceProduct = await call(`/admin/products/${last.id}`, { token: adminToken });
  verdict('S-46', 'HIGH', 'ten concurrent checkouts oversell the last unit',
    winners !== 1 || raceProduct.json.data.stock < 0,
    `statuses ${codes.join(',')}; winners=${winners}; stock now ${raceProduct.json.data.stock}, soldCount ${raceProduct.json.data.soldCount}`);
  const serverErrors = results.filter((r) => r.status >= 500).length;
  verdict('S-46b', 'MEDIUM', 'the losing races surface as server errors', serverErrors > 0, `5xx count ${serverErrors}`);

  /* --------------------------------------------------------------------- S-47 upload attack matrix */
  const cases: Array<{ id: string; title: string; severity: string; file: { name: string; type: string; bytes: Uint8Array }; expectPass: boolean }> = [
    { id: 'U-1', title: 'a text payload declared as image/png is stored', severity: 'HIGH', expectPass: false, file: { name: 'payload.png', type: 'image/png', bytes: text('<?php system($_GET["c"]); ?>\n') } },
    { id: 'U-2', title: 'a PNG-magic file declared image/jpeg is stored', severity: 'MEDIUM', expectPass: false, file: { name: 'mismatch.jpeg', type: 'image/jpeg', bytes: concat(PNG_MAGIC, text('\nnot a jpeg')) } },
    { id: 'U-3', title: 'a polyglot PNG with appended script reaches storage', severity: 'MEDIUM', expectPass: true, file: { name: 'polyglot.png', type: 'image/png', bytes: concat(PNG_MAGIC, text('<script>alert(document.domain)</script>'), new Uint8Array(64)) } },
    { id: 'U-4', title: 'an SVG carrying <script> reaches storage unsanitised', severity: 'MEDIUM', expectPass: true, file: { name: 'icon.svg', type: 'image/svg+xml', bytes: text('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(document.domain)</script><circle r="5" fill="red"/></svg>') } },
    { id: 'U-5', title: 'an SVG with an external entity reaches storage', severity: 'MEDIUM', expectPass: true, file: { name: 'xxe.svg', type: 'image/svg+xml', bytes: text('<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg"><text>&xxe;</text></svg>') } },
    { id: 'U-6', title: 'a traversal filename is forwarded to the storage client', severity: 'MEDIUM', expectPass: true, file: { name: '../../../../../../tmp/pwned.svg', type: 'image/svg+xml', bytes: text('<svg xmlns="http://www.w3.org/2000/svg"></svg>') } },
    { id: 'U-7', title: 'a null byte in the filename is forwarded to the storage client', severity: 'MEDIUM', expectPass: true, file: { name: 'shell.svg\u0000.png', type: 'image/svg+xml', bytes: text('<svg xmlns="http://www.w3.org/2000/svg"></svg>') } },
    { id: 'U-8', title: 'a declared PHP type is refused before buffering', severity: 'LOW', expectPass: false, file: { name: 'shell.php', type: 'application/x-php', bytes: text('<?php echo 1; ?>') } },
    { id: 'U-9', title: 'an animated GIF carrying HTML reaches storage', severity: 'LOW', expectPass: true, file: { name: 'anim.gif', type: 'image/gif', bytes: concat(GIF_MAGIC, text('<img src=x onerror=alert(1)>')) } },
  ];

  /**
   * These three clear content inspection because their leading magic really is the
   * type they declare, which is correct behaviour for the filter. What the storage
   * provider does with the trailing bytes is not observable from this repository, so
   * they are recorded as open questions rather than claimed as exploits.
   */
  const recordedOnly = new Set(['U-3', 'U-6', 'U-9']);
  for (const testCase of cases) {
    const outcome = await uploadAttempt(testCase.file, adminToken, { folder: 'products/../../secret' });
    const handedToStorage = outcome.code === 'UPLOAD_FAILED' || outcome.status === 503;
    const evidence = `HTTP ${outcome.status} code=${outcome.code ?? '-'} message="${outcome.message.slice(0, 90)}" -> ${handedToStorage ? 'bytes passed content inspection and were handed to the storage client' : 'refused before storage'}`;
    if (recordedOnly.has(testCase.id)) note(testCase.id, testCase.severity, `${testCase.title} (recorded, not claimed)`, evidence);
    else verdict(testCase.id, testCase.severity, testCase.title, handedToStorage, evidence);
  }

  /** The storage key is generated server-side; this is what survives the sanitiser. */
  console.log(`  key sanitisation: folder "products/../../secret" -> "${slugify('products/../../secret')}", name "../../../../../../tmp/pwned.svg" -> "${slugify(path.basename('../../../../../../tmp/pwned.svg', '.svg'))}"`);

  const big = new Uint8Array(9 * 1024 * 1024);
  big.set(PNG_MAGIC);
  const oversized = await uploadAttempt({ name: 'big.png', type: 'image/png', bytes: big }, adminToken);
  verdict('U-10', 'LOW', 'an upload above the size cap is accepted', oversized.status < 413, `HTTP ${oversized.status} "${oversized.message.slice(0, 60)}"`);

  const many = new FormData();
  for (let i = 0; i < 12; i += 1) many.append('files', new Blob([concat(PNG_MAGIC, text(`file ${i}`))], { type: 'image/png' }), `many-${i}.png`);
  const manyRes = await fetch(`${BASE}/admin/media/upload`, { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: many });
  const manyJson = await manyRes.json().catch(() => undefined as any);
  verdict('U-11', 'LOW', 'more files than the cap are processed', manyRes.status < 400, `HTTP ${manyRes.status} "${String(manyJson?.message ?? '').slice(0, 60)}"`);

  const memberUpload = await uploadAttempt({ name: 'member.png', type: 'image/png', bytes: concat(PNG_MAGIC, new Uint8Array(16)) }, member.token);
  verdict('U-12', 'HIGH', 'a non-admin uploads into the media library', memberUpload.status < 400, `HTTP ${memberUpload.status}`);

  const noAuth = await uploadAttempt({ name: 'anon.png', type: 'image/png', bytes: concat(PNG_MAGIC, new Uint8Array(16)) }, '');
  verdict('U-13', 'HIGH', 'an anonymous request uploads into the media library', noAuth.status < 400, `HTTP ${noAuth.status}`);

  /* ------------------------------------------------------------- S-48 media list exposure */
  const mediaAsMember = await call('/admin/media?limit=5', { token: member.token });
  const mediaAnon = await call('/admin/media?limit=5');
  const mediaAsAdmin = await call('/admin/media?limit=5', { token: adminToken });
  const memberItems = mediaAsMember.json?.data?.items?.length ?? (Array.isArray(mediaAsMember.json?.data) ? mediaAsMember.json.data.length : 0);
  verdict('S-48', 'LOW', 'the media list leaks the storage folder layout to non-admins',
    mediaAsMember.status === 200 || mediaAnon.status === 200,
    `member GET /admin/media ${mediaAsMember.status} items=${memberItems}, anonymous ${mediaAnon.status}, admin ${mediaAsAdmin.status} (the admin row is the only one that should ever answer)`);

  console.log('\nphase 4 done');
}

main().catch((e) => {
  console.error('harness error:', (e as Error).message);
  process.exit(1);
});
