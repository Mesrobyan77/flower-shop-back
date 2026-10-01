/* eslint-disable no-console */
/**
 * Payment security end-to-end checks (Checkpoint: Checkout UX + Payment Tabs).
 *
 * Runs against a live in-memory API booted with Idram test credentials:
 *
 *   IDRAM_REC_ACCOUNT=TESTMERCHANT IDRAM_SECRET_KEY=test-secret npm run dev:memory
 *   IDRAM_REC_ACCOUNT=TESTMERCHANT IDRAM_SECRET_KEY=test-secret npm run payment:security
 *
 * Covers: credential-driven availability, checkout -> payment atomicity, start
 * idempotency, the full Idram RESULT_URL matrix (precheck echo, checksum,
 * amount, unknown bill, foreign account, cancelled order, replay, duplicate
 * transaction id), client-tampering resistance, and the ArCa branch - both
 * "not configured" (503 PROVIDER_UNAVAILABLE) and "configured but gateway
 * unreachable" (502 with a released lease, never a pretend payment).
 */
import crypto from 'crypto';

const BASE = process.env.SMOKE_API ?? 'http://localhost:5000/api';
const REC_ACCOUNT = process.env.IDRAM_REC_ACCOUNT ?? 'TESTMERCHANT';
const SECRET_KEY = process.env.IDRAM_SECRET_KEY ?? 'test-secret';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@anahit-flower.am';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!';

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

/** Idram's RESULT_URL speaks form-encoded EDP_* fields and answers "OK"/"ERROR". */
async function idramResult(fields: Record<string, string>) {
  const response = await fetch(`${BASE}/payments/idram/result`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });
  return { status: response.status, text: await response.text() };
}

/** MD5 of REC_ACCOUNT:AMOUNT:SECRET:BILL_NO:PAYER:TRANS_ID:TRANS_DATE - the exact Idram recipe. */
function checksum(fields: Record<string, string>) {
  const text = [
    fields.EDP_REC_ACCOUNT,
    fields.EDP_AMOUNT,
    SECRET_KEY,
    fields.EDP_BILL_NO,
    fields.EDP_PAYER_ACCOUNT ?? '',
    fields.EDP_TRANS_ID ?? '',
    fields.EDP_TRANS_DATE ?? '',
  ].join(':');
  return crypto.createHash('md5').update(text, 'utf8').digest('hex');
}

/** Guest journey: add a quick-delivery bouquet to the cart and check out online. */
async function placeOnlineOrder(paymentMethod: 'idram' | 'arca', extra: Record<string, unknown> = {}) {
  const products = await call('/products?limit=5');
  const detail = await call(`/products/${products.body.data[0].slug}`);
  const product = detail.body.data.product;
  const quick = detail.body.data.delivery.find((d: any) => d.method === 'quick');
  const deliveryDate = quick.calendar.find((d: any) => d.available).date;

  /** Satisfy every required option group (sizes etc.) with its first choice. */
  const options = (product.optionGroups ?? [])
    .filter((g: any) => g.required && !['delivery_method', 'delivery_date', 'delivery_time'].includes(g.key))
    .map((g: any) =>
      g.type === 'select'
        ? { groupKey: g.key, optionKey: (g.options.find((o: any) => o.isAvailable !== false) ?? g.options[0])?.key }
        : { groupKey: g.key, value: 'Test' },
    )
    .filter((o: any) => o.optionKey || o.value);

  await call('/cart');
  const added = await call('/cart/items', {
    method: 'POST',
    body: {
      productId: product.id,
      quantity: 1,
      options,
      deliveryMethod: 'quick',
      deliveryDate,
      timeSlot: quick.timeSlots[0],
    },
  });
  if (added.status !== 201) {
    throw new Error(`Could not add to cart (${added.status}): ${JSON.stringify(added.body).slice(0, 300)}`);
  }

  const checkout = await call('/orders/checkout', {
    method: 'POST',
    body: {
      customer: { name: 'Payment Tester', email: `pay_${Date.now()}@example.com`, phone: '+374 99 123456' },
      delivery: {
        method: 'quick',
        recipient: 'Mariam',
        phone: '+374 91 000000',
        region: 'yerevan',
        city: 'Yerevan',
        street: 'Hanrapetutyan 25',
        requestedDate: deliveryDate,
        timeSlot: quick.timeSlots[0],
      },
      agreeTerms: true,
      paymentMethod,
      ...extra,
    },
  });
  return { added, checkout };
}

async function main() {
  section('Provider availability');

  const methods = await call('/payments/methods');
  const flags: Record<string, boolean> = Object.fromEntries(
    (methods.body.data ?? []).map((m: any) => [m.key, m.enabled]),
  );
  check('methods endpoint lists all three methods', methods.status === 200 && Object.keys(flags).length === 3, methods.body);
  check('cash on delivery is always available', flags.cash_on_delivery === true);
  check('this run has Idram enabled', flags.idram === true, 'Boot the API with IDRAM_REC_ACCOUNT and IDRAM_SECRET_KEY set');
  if (flags.idram !== true) {
    console.log('\nIdram credentials missing on the running API - aborting.\n');
    process.exit(1);
  }

  section('Checkout creates order + pending payment together');

  const a = await placeOnlineOrder('idram');
  check('idram checkout succeeds', a.checkout.status === 201, a.checkout.body);
  const orderA = a.checkout.body.data.order;
  const paymentA = a.checkout.body.data.payment;
  check('checkout returns the payment payload', Boolean(paymentA), a.checkout.body);
  check('payment provider is idram', paymentA?.provider === 'idram');
  check('order records the payment method', orderA.paymentMethod === 'idram');
  check('payment starts pending', orderA.paymentStatus === 'pending');
  check('payment amount equals the server-computed order total', paymentA?.amount === orderA.total);
  check('return token is unguessable', typeof paymentA?.returnToken === 'string' && paymentA.returnToken.length >= 16);
  const tokenA = paymentA.returnToken as string;

  section('Start is idempotent and server-derived');

  const start1 = await call('/payments/start', { method: 'POST', body: { token: tokenA, locale: 'hy' } });
  check('start returns the hosted-page form', start1.body.data.kind === 'form', start1.body);
  check('form posts to the configured Idram page', String(start1.body.data.action).includes('idram'), start1.body.data.action);
  const f1 = start1.body.data.fields;
  check('form carries the registered merchant account', f1.EDP_REC_ACCOUNT === REC_ACCOUNT, f1);
  check('bill number is the order code', f1.EDP_BILL_NO === orderA.code);
  check('amount comes from the order, not the client', f1.EDP_AMOUNT === String(orderA.total));
  check('language follows the locale', f1.EDP_LANGUAGE === 'AM');

  const start2 = await call('/payments/start', { method: 'POST', body: { token: tokenA, locale: 'hy' } });
  check(
    'repeated start reuses the same bill (no duplicate payment)',
    start2.body.data.fields.EDP_BILL_NO === f1.EDP_BILL_NO && start2.body.data.payment.status === 'pending',
    start2.body,
  );
  const status0 = await call(`/payments/status?token=${tokenA}`);
  check('status starts pending/pending', status0.body.data.payment.status === 'pending' && status0.body.data.order.paymentStatus === 'pending');

  section('Idram RESULT_URL matrix');

  const base = { EDP_REC_ACCOUNT: REC_ACCOUNT, EDP_AMOUNT: String(orderA.total), EDP_BILL_NO: orderA.code };

  const precheck = await idramResult({ ...base, EDP_PRECHECK: 'YES' });
  check('valid precheck answers OK', precheck.text === 'OK', precheck);

  const precheckWrongAmount = await idramResult({ ...base, EDP_PRECHECK: 'YES', EDP_AMOUNT: String(orderA.total + 1) });
  check('precheck on a wrong amount answers ERROR', precheckWrongAmount.text === 'ERROR');

  const precheckForeignAccount = await idramResult({ ...base, EDP_PRECHECK: 'YES', EDP_REC_ACCOUNT: 'SOMEONE-ELSE' });
  check('precheck for a foreign merchant account answers ERROR', precheckForeignAccount.text === 'ERROR');

  const precheckUnknownBill = await idramResult({ ...base, EDP_PRECHECK: 'YES', EDP_BILL_NO: 'XF-00000000-XXXXX' });
  check('precheck for an unknown bill answers ERROR', precheckUnknownBill.text === 'ERROR');

  const forged = await idramResult({
    ...base,
    EDP_PAYER_ACCOUNT: 'PA1',
    EDP_TRANS_ID: `T-${Date.now()}-forged`,
    EDP_TRANS_DATE: '01/10/2026 10:00:00',
    EDP_CHECKSUM: 'f'.repeat(32),
  });
  check('a forged checksum answers ERROR', forged.text === 'ERROR');
  const afterForged = await call(`/payments/status?token=${tokenA}`);
  check(
    'a forged confirmation cannot mark anything paid',
    afterForged.body.data.payment.status === 'pending' && afterForged.body.data.order.paymentStatus === 'pending',
  );

  const tamperedFields = {
    ...base,
    EDP_AMOUNT: String(orderA.total + 100),
    EDP_PAYER_ACCOUNT: 'PA1',
    EDP_TRANS_ID: `T-${Date.now()}-tampered`,
    EDP_TRANS_DATE: '01/10/2026 10:00:00',
  };
  const tampered = await idramResult({ ...tamperedFields, EDP_CHECKSUM: checksum(tamperedFields) });
  check('a checksum valid for a wrong amount is refused', tampered.text === 'ERROR');

  const txnId = `T-${Date.now()}-ok`;
  const confirmFields = { ...base, EDP_PAYER_ACCOUNT: 'PA1', EDP_TRANS_ID: txnId, EDP_TRANS_DATE: '01/10/2026 10:00:00' };
  const confirmed = await idramResult({ ...confirmFields, EDP_CHECKSUM: checksum(confirmFields) });
  check('the genuine confirmation answers OK', confirmed.text === 'OK', confirmed);
  const paidStatus = await call(`/payments/status?token=${tokenA}`);
  check('only the verified confirmation marks the payment paid', paidStatus.body.data.payment.status === 'paid', paidStatus.body);
  check('the order mirrors the paid state', paidStatus.body.data.order.paymentStatus === 'paid');

  const replayed = await idramResult({ ...confirmFields, EDP_CHECKSUM: checksum(confirmFields) });
  check('a replayed confirmation is a no-op that still answers OK', replayed.text === 'OK');
  const replayPrecheck = await idramResult({ ...base, EDP_PRECHECK: 'YES' });
  check('a settled bill can never be charged again (precheck ERROR)', replayPrecheck.text === 'ERROR');
  const startPaid = await call('/payments/start', { method: 'POST', body: { token: tokenA } });
  check('start on a paid payment reports paid instead of redirecting', startPaid.body.data.kind === 'paid');

  section('A settled transaction id cannot pay a second order');

  const b = await placeOnlineOrder('idram');
  const orderB = b.checkout.body.data.order;
  const tokenB = b.checkout.body.data.payment.returnToken;
  check('second idram order is ready', b.checkout.status === 201 && orderB.paymentStatus === 'pending', b.checkout.body);
  const dupFields = {
    EDP_REC_ACCOUNT: REC_ACCOUNT,
    EDP_AMOUNT: String(orderB.total),
    EDP_BILL_NO: orderB.code,
    EDP_PAYER_ACCOUNT: 'PA1',
    EDP_TRANS_ID: txnId,
    EDP_TRANS_DATE: '01/10/2026 10:00:00',
  };
  const dup = await idramResult({ ...dupFields, EDP_CHECKSUM: checksum(dupFields) });
  check('duplicate transaction id is acknowledged', dup.text === 'OK');
  const afterDup = await call(`/payments/status?token=${tokenB}`);
  check(
    'but the second order stays unpaid',
    afterDup.body.data.payment.status === 'pending' && afterDup.body.data.order.paymentStatus === 'pending',
    afterDup.body,
  );

  section('Clients cannot set money or payment state');

  const c = await placeOnlineOrder('idram', { paymentStatus: 'paid', total: 1, subtotal: 1, amount: 1 });
  check('tampered checkout succeeds but is ignored', c.checkout.status === 201, c.checkout.body);
  const orderC = c.checkout.body.data.order;
  check(
    'client-sent money fields are overridden server-side',
    orderC.paymentStatus === 'pending' && orderC.total !== 1 && c.checkout.body.data.payment.amount === orderC.total,
    { total: orderC.total, paymentStatus: orderC.paymentStatus },
  );

  const unknownStart = await call('/payments/start', { method: 'POST', body: { token: 'x'.repeat(20) } });
  check('an unknown return token cannot start a payment', unknownStart.status === 404);
  const unknownStatus = await call(`/payments/status?token=${'x'.repeat(20)}`);
  check('an unknown return token cannot read a payment', unknownStatus.status === 404);
  const shortToken = await call('/payments/status?token=abc');
  check('malformed tokens are rejected by validation', shortToken.status === 422, shortToken.body);

  section('A cancelled order cannot be paid');

  const admin = await call('/auth/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  check('admin signs in', admin.status === 200, 'Set SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD if the demo admin is not seeded');
  const adminToken = admin.body.data.accessToken;
  const cancelled = await call(`/admin/orders/${orderC.id}/status`, {
    method: 'PATCH',
    token: adminToken,
    body: { status: 'cancelled' },
  });
  check('admin cancels the order', cancelled.status === 200 && cancelled.body.data.status === 'cancelled', cancelled.body);
  const startCancelled = await call('/payments/start', { method: 'POST', body: { token: c.checkout.body.data.payment.returnToken } });
  check('start on a cancelled order is refused', startCancelled.status === 409, startCancelled.body);
  const precheckCancelled = await idramResult({ EDP_REC_ACCOUNT: REC_ACCOUNT, EDP_AMOUNT: String(orderC.total), EDP_BILL_NO: orderC.code, EDP_PRECHECK: 'YES' });
  check('precheck on a cancelled order answers ERROR', precheckCancelled.text === 'ERROR');

  section('ArCa branch');

  if (flags.arca !== true) {
    const d = await placeOnlineOrder('arca');
    check(
      'checkout with an unconfigured provider fails with 503 PROVIDER_UNAVAILABLE',
      d.checkout.status === 503 && d.checkout.body.code === 'PROVIDER_UNAVAILABLE',
      d.checkout.body,
    );
    const cartAfter = await call('/cart');
    check('the refused checkout leaves the cart untouched', cartAfter.body.data.items.length > 0, cartAfter.body.data.items.length);
  } else {
    const d = await placeOnlineOrder('arca');
    check('arca checkout creates the order with a payment record', d.checkout.status === 201 && Boolean(d.checkout.body.data.payment), d.checkout.body);
    const orderD = d.checkout.body.data.order;
    const tokenD = d.checkout.body.data.payment.returnToken;

    const startD = await call('/payments/start', { method: 'POST', body: { token: tokenD } });
    check('an unreachable gateway fails cleanly with 502 PROVIDER_ERROR', startD.status === 502 && startD.body.code === 'PROVIDER_ERROR', startD.body);
    const statusD = await call(`/payments/status?token=${tokenD}`);
    check('the failed registration did not mark anything paid', statusD.body.data.payment.status === 'pending' && statusD.body.data.order.paymentStatus === 'pending');
    check('the attempt is recorded for a safe retry', statusD.body.data.payment.attempts === 1, statusD.body.data.payment);

    const retryD = await call('/payments/start', { method: 'POST', body: { token: tokenD } });
    check('a retry fails the same way without duplicating anything', retryD.status === 502);
    const statusD2 = await call(`/payments/status?token=${tokenD}`);
    check('the retry bumps attempts on the same payment record', statusD2.body.data.payment.attempts === 2, statusD2.body.data.payment);

    const crossProvider = await idramResult({
      EDP_REC_ACCOUNT: REC_ACCOUNT,
      EDP_AMOUNT: String(orderD.total),
      EDP_BILL_NO: orderD.code,
      EDP_PRECHECK: 'YES',
    });
    check('an ArCa bill never resolves through the Idram callback', crossProvider.text === 'ERROR');
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
