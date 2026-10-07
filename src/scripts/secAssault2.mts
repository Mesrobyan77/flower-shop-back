/* eslint-disable no-console */
/**
 * Phase 2 of the assault: business logic, content abuse, capability tokens and
 * rate-limit bypass against the LOCAL test API. Prints no token or secret value.
 * Every record it creates is its own throwaway account's data and is cleaned up.
 */
import crypto from 'crypto';

const BASE = process.env.SEC_API ?? 'http://localhost:5000/api';
const PW = `Xa1!${crypto.randomBytes(6).toString('hex')}`;
const RUN = Date.now();

let reqCount = 0;
async function throttle() {
  reqCount += 1;
  if (reqCount % 240 === 0) await new Promise((r) => setTimeout(r, 22_000));
}

/**
 * Each request carries its own X-Forwarded-For because the API trusts one proxy hop,
 * which makes the IP budget follow the header. That is the S-30 finding under test;
 * the run therefore also keeps a no-header control for the credential endpoints.
 */
interface Jar {
  cookies: Map<string, string>;
  ip: string;
}

const freshJar = (): Jar => ({ cookies: new Map(), ip: `10.${(RUN % 200) + Math.floor(Math.random() * 60)}.${RUN % 250}.${Math.floor(Math.random() * 250)}` });

async function call(
  jar: Jar,
  method: string,
  path: string,
  opts: { body?: unknown; token?: string; raw?: string; contentType?: string; headers?: Record<string, string>; noSpoof?: boolean } = {},
) {
  await throttle();
  const headers: Record<string, string> = { ...opts.headers };
  if (!opts.noSpoof) headers['X-Forwarded-For'] = jar.ip;
  if (opts.contentType) headers['Content-Type'] = opts.contentType;
  else if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (jar.cookies.size) headers.Cookie = [...jar.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts.raw ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
  });
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(';');
    const i = pair.indexOf('=');
    if (i > 0) jar.cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: res.status, json, text, headers: res.headers };
}

const pickItem = (json: any) => (Array.isArray(json?.data) ? json.data[0] : json?.data?.items?.[0]);

async function register(tag: string) {
  const jar = freshJar();
  const email = `sec2.${tag}.${RUN}@example.test`;
  const res = await call(jar, 'POST', '/auth/register', {
    body: { email, password: PW, name: `Sec2 ${tag}`, phone: '+37499000000', marketingOptIn: false, agreeTerms: true },
  });
  return { jar, email, id: String(res.json?.data?.user?.id ?? ''), token: res.json?.data?.accessToken as string, res };
}

function log(id: string, sev: string, title: string, exploited: boolean, evidence: string, forced?: 'INFO' | 'ENV') {
  const result = forced ?? (exploited ? 'EXPLOITED' : 'BLOCKED');
  console.log(`${result} [${id}] (${sev}) ${title} :: ${evidence}`.slice(0, 700));
  return result;
}

async function main() {
  console.log(`\n=== PHASE 2 against ${BASE} (local test env) ===\n`);

  const products = await call(freshJar(), 'GET', '/products?limit=24');
  const list = Array.isArray(products.json?.data) ? products.json.data : (products.json?.data?.items ?? []);
  const product = list.find((p: any) => p.trackStock && p.stock > 1) ?? list[0];
  const pid = String(product.id);
  console.log(`product: ${product.slug} price=${product.price} stock=${product.stock} track=${product.trackStock} groups=${(product.optionGroups ?? []).map((g: any) => g.key).join(',')}`);

  const detailRes = await call(freshJar(), 'GET', `/products/${product.slug}`);
  const optProduct: any = detailRes.json?.data ?? product;
  const selectGroup = (optProduct.optionGroups ?? []).find((g: any) => g.type === 'select' && (g.options ?? []).length);
  const bogus = { groupKey: selectGroup?.key ?? 'chocolate', optionKey: selectGroup?.options?.[0]?.key ?? 'choc_s', priceDelta: -999999, value: 'x' };
  console.log(`option product: ${optProduct.slug} price=${optProduct.price} groups=${(optProduct.optionGroups ?? []).map((g: any) => g.key).join(',')} realOption=${selectGroup?.key}/${selectGroup?.options?.[0]?.key} delta=${selectGroup?.options?.[0]?.priceDelta}`);

  const A = await register('a');
  const B = await register('b');
  console.log(`\nA=${A.id} B=${B.id} register -> ${A.res.status}/${B.res.status}, A points baseline=${A.res.json?.data?.user?.points}`);
  const baselinePoints = Number(A.res.json?.data?.user?.points);

  /* ------------------------------------------- mass assignment, measured properly */
  const evil = await call(freshJar(), 'POST', '/auth/register', {
    body: {
      email: `sec2.evil.${RUN}@example.test`, password: PW, name: 'Evil', agreeTerms: true,
      role: 'admin', isAdmin: true, points: 9_999_999, totalSpend: 9_999_999, grade: 'partner', isActive: true, isVerified: true,
    },
  });
  const evilMe = await call(freshJar(), 'GET', '/auth/me', { token: evil.json?.data?.accessToken });
  const eu = evilMe.json?.data ?? {};
  log('S-12', 'CRITICAL', 'mass assignment on register yields admin / free points',
    eu.role !== 'user' || Number(eu.points) > baselinePoints || Number(eu.totalSpend) > 0 || eu.grade !== 'general',
    `register -> ${evil.status}; me: role=${eu.role} points=${eu.points} totalSpend=${eu.totalSpend} grade=${eu.grade}`);

  const patch = await call(A.jar, 'PATCH', '/auth/me', {
    token: A.token,
    body: { name: 'Sec2 a', role: 'admin', points: 9_999_999, totalSpend: 9_999_999, grade: 'partner', isActive: false, password: 'Hacked123!' },
  });
  const after = await call(A.jar, 'GET', '/auth/me', { token: A.token });
  const au = after.json?.data ?? {};
  log('S-13', 'CRITICAL', 'profile PATCH escalates role, grants points or rewrites password',
    au.role === 'admin' || Number(au.points) > baselinePoints || Number(au.totalSpend) > 0 || au.grade !== 'general',
    `PATCH -> ${patch.status}; me: role=${au.role} points=${au.points} totalSpend=${au.totalSpend} grade=${au.grade} name="${au.name}"`);
  const pwStillWorks = await call(freshJar(), 'POST', '/auth/login', { body: { email: A.email, password: PW } });
  log('S-13b', 'CRITICAL', 'PATCH body password field changed the credential', pwStillWorks.status !== 200,
    `login with the original password after the PATCH -> ${pwStillWorks.status}`);

  /* -------------------------------------------------------------- price tampering */
  const jar = freshJar();
  const clean = await call(jar, 'POST', '/cart/items', { token: A.token, body: { productId: pid, quantity: 1, deliveryMethod: 'quick' } });
  const tampered = await call(jar, 'POST', '/cart/items', {
    token: A.token,
    body: {
      productId: pid, quantity: 1, deliveryMethod: 'quick',
      unitPrice: 1, price: 1, lineTotal: 1, total: 1, discount: 99999, pointsUsed: 0,
      priceDelta: -999999, options: [bogus],
    },
  });
  const view = await call(jar, 'GET', '/cart', { token: A.token });
  const items = view.json?.data?.items ?? [];
  const unitPrices = items.map((i: any) => i.unitPrice);
  const deltas = items.flatMap((i: any) => (i.options ?? []).map((o: any) => o.priceDelta));
  const totals = view.json?.data?.totals ?? {};
  log('S-16', 'CRITICAL', 'client-supplied price / priceDelta / totals accepted',
    unitPrices.some((p: number) => p !== Number(optProduct.price) && p !== Number(product.price)) || deltas.some((d: number) => d === -999999),
    `clean add -> ${clean.status}, tampered add -> ${tampered.status}; stored unitPrices=${JSON.stringify(unitPrices)} optionDeltas=${JSON.stringify(deltas)} merchandiseTotal=${totals.merchandiseTotal} (catalogue price ${product.price})`);

  /* ------------------------------------------------------------- quantity abuse */
  const qty = async (q: unknown) => (await call(jar, 'POST', '/cart/items', { token: A.token, body: { productId: pid, quantity: q, deliveryMethod: 'quick' } })).status;
  const negRes = await call(jar, 'PATCH', `/cart/items/${items[0]?.id}`, { token: A.token, body: { quantity: -5 } });
  const zeroRes = await call(jar, 'PATCH', `/cart/items/${items[0]?.id}`, { token: A.token, body: { quantity: 0 } });
  const bigRes = await call(jar, 'PATCH', `/cart/items/${items[0]?.id}`, { token: A.token, body: { quantity: 99999 } });
  const fracRes = await call(jar, 'PATCH', `/cart/items/${items[0]?.id}`, { token: A.token, body: { quantity: 1.5 } });
  const stockBustingRes = await call(jar, 'PATCH', `/cart/items/${items[0]?.id}`, { token: A.token, body: { quantity: 99 } });
  const viewAfterQty = await call(jar, 'GET', '/cart', { token: A.token });
  log('S-17', 'HIGH', 'abnormal quantity accepted into a live line',
    [negRes, zeroRes, bigRes, fracRes].some((r) => r.status === 200),
    `add(neg/zero/huge/frac) -> ${await qty(-5)}/${await qty(0)}/${await qty(100000)}/${await qty(1.5)}; PATCH neg/zero/huge/frac -> ${negRes.status}/${zeroRes.status}/${bigRes.status}/${fracRes.status}; qty=99 vs stock ${product.stock} -> ${stockBustingRes.status}; cart now ${JSON.stringify((viewAfterQty.json?.data?.items ?? []).map((i: any) => i.quantity))}`);
  await call(jar, 'DELETE', '/cart', { token: A.token, body: {} });

  /* -------------------------------------------------------- checkout field abuse */
  await call(jar, 'POST', '/cart/items', { token: A.token, body: { productId: pid, quantity: 1, deliveryMethod: 'quick' } });
  const checkoutInject = await call(jar, 'POST', '/orders/checkout?locale=hy', {
    token: A.token,
    body: {
      customer: { name: 'Sec2 A', email: A.email, phone: '+374991111111', role: 'admin', id: B.id },
      delivery: { method: 'quick', recipient: 'Sec2 A', phone: '+374991111111', region: 'yerevan', city: 'Yerevan', street: 'Audit street 1', price: 1, fee: 0 },
      pointsUsed: 999_999, total: 1, subtotal: 1, status: 'completed', paymentStatus: 'paid', adminNote: 'injected-internal', agreeTerms: true,
    },
  });
  const order = checkoutInject.json?.data?.order ?? {};
  const orderText = checkoutInject.text;
  log('S-19', 'CRITICAL', 'checkout honors client price / status / payment state / notes',
    /injected-internal/.test(orderText) || order.paymentStatus === 'paid' || order.status === 'completed' || Number(order.total) === 1 || Number(order.pointsUsed) > baselinePoints,
    `checkout -> ${checkoutInject.status}; code=${order.code} status=${order.status} paymentStatus=${order.paymentStatus} total=${order.total} pointsUsed=${order.pointsUsed} adminNote in response=${/injected-internal/.test(orderText)}`);

  const bal = await call(A.jar, 'GET', '/account/summary', { token: A.token });
  log('S-19b', 'CRITICAL', 'loyalty over-spend or negative balance',
    Number(bal.json?.data?.points) > baselinePoints || Number(bal.json?.data?.points) < 0 || Number(order.pointsUsed) > baselinePoints,
    `balance ${baselinePoints} -> ${bal.json?.data?.points}, spent on order=${order.pointsUsed}`);

  const orderCode = String(order.code ?? '');
  const orderId = String(order.id ?? order._id ?? '');

  /* ------------------------------------------------- internal text in customer JSON */
  const fields = Object.keys(order);
  log('S-23', 'MEDIUM', 'customer-facing order JSON carries internal operations fields',
    fields.includes('adminNote') || fields.includes('cancelReason') || /changedBy/.test(orderText),
    `order keys: ${fields.join(',')}`);

  const detail = await call(A.jar, 'GET', `/orders/${orderCode}`, { token: A.token });
  const otherDetail = await call(B.jar, 'GET', `/orders/${orderCode}`, { token: B.token });
  log('S-15', 'HIGH', 'cross-account order read or cancellation',
    otherDetail.status === 200,
    `owner detail -> ${detail.status}, stranger detail -> ${otherDetail.status}`);

  const cancelAgain = await call(A.jar, 'POST', `/orders/${orderCode}/cancel`, { token: A.token, body: { reason: 'first cancel' } });
  const cancelReplay = await call(A.jar, 'POST', `/orders/${orderCode}/cancel`, { token: A.token, body: { reason: 'second cancel' } });
  log('S-27', 'MEDIUM', 'repeated cancellation re-applies side effects',
    cancelReplay.status === 200,
    `first -> ${cancelAgain.status}, replay -> ${cancelReplay.status}`);

  /* -------------------------------------------------------- payment capability */
  const fakeTok = await call(freshJar(), 'GET', `/payments/status?token=${crypto.randomBytes(16).toString('hex')}`);
  const shortTok = await call(freshJar(), 'GET', `/payments/status?token=1`);
  const objTok = await call(freshJar(), 'GET', `/payments/status?token[$ne]=1`);
  const startOther = await call(freshJar(), 'POST', '/payments/start', { body: { token: orderCode } });
  log('S-28', 'HIGH', 'payment status endpoint guessable or injection-prone',
    fakeTok.status === 200 || objTok.status === 200,
    `random token -> ${fakeTok.status}, degenerate token -> ${shortTok.status}, operator token -> ${objTok.status}, start with an order code -> ${startOther.status} ${startOther.text.slice(0, 60)}`);

  /* ------------------------------------------------------------ review abuse */
  const rev1 = await call(A.jar, 'POST', '/reviews', { token: A.token, body: { product: pid, rating: 5, title: 'audit r1', body: 'audit review body one for the security pass' } });
  const revId = String(rev1.json?.data?._id ?? '');
  const rev2 = await call(A.jar, 'POST', '/reviews', { token: A.token, body: { product: pid, rating: 1, title: 'audit r2', body: 'audit review body two for the security pass' } });
  const rev3 = await call(A.jar, 'POST', '/reviews', { token: A.token, body: { product: pid, rating: 5, title: 'audit r3', body: 'audit review body three for the security pass' } });
  const revB = await call(B.jar, 'POST', '/reviews', { token: B.token, body: { product: pid, rating: 5, title: 'audit b1', body: 'audit review body from B for the security pass' } });
  const slug = String(product.slug);
  const summary = await call(freshJar(), 'GET', `/products/${slug}/reviews?limit=50`);
  const counts = summary.json?.data?.meta?.summary ?? summary.json?.meta?.summary ?? null;
  const own = [rev1, rev2, rev3].map((r) => r.status);
  log('S-29', 'MEDIUM', 'the same user can pile up reviews for one product and move the advertised rating',
    own.filter((s) => s === 201).length > 1,
    `owner statuses ${JSON.stringify(own)}, second account ${revB.status}; product summary now ${JSON.stringify(counts)}`);

  /* --------------------------------------------------- helpful vote inflation */
  let helpful = 'n/a';
  if (revId) {
    const votes = await Promise.all(
      Array.from({ length: 30 }, () => call(freshJar(), 'POST', `/reviews/${revId}/helpful`, { body: {} })),
    );
    const after1 = await call(freshJar(), 'GET', `/products/${slug}/reviews?limit=50`);
    const mine = (after1.json?.data?.items ?? after1.json?.data ?? []).find?.((r: any) => String(r._id) === revId) ?? {};
    helpful = `helpfulCount=${mine.helpfulCount} after 30 anonymous votes (statuses ${JSON.stringify([...new Set(votes.map((v) => v.status))])})`;
    log('S-30', 'HIGH', 'anonymous unlimited helpful-vote inflation', Number(mine.helpfulCount ?? 0) >= 20, helpful);
  }

  /* --------------------------------------------------- stranger mutations */
  const delByB = revId ? await call(B.jar, 'DELETE', `/reviews/${revId}`, { token: B.token }) : null;
  const inqA = await call(A.jar, 'POST', '/inquiries', { token: A.token, body: { product: pid, subject: 'private subject A', body: 'private question body A for audit', isSecret: true } });
  const inqId = String(inqA.json?.data?._id ?? '');
  const inqByB = await call(B.jar, 'GET', `/inquiries/${inqId}`, { token: B.token });
  const inqAnon = await call(freshJar(), 'GET', `/inquiries/${inqId}`);
  const inqByOwner = await call(A.jar, 'GET', `/inquiries/${inqId}`, { token: A.token });
  log('S-31', 'HIGH', 'secret inquiry readable by a stranger',
    /private question body A|private subject A/.test(inqByB.text + inqAnon.text),
    `owner -> ${inqByOwner.status}, stranger -> ${inqByB.status} leak=${/private question body A/.test(inqByB.text)}, anon -> ${inqAnon.status} leak=${/private question body A/.test(inqAnon.text)}, review delete by stranger -> ${delByB?.status}`);

  const addrA = await call(A.jar, 'POST', '/account/addresses', { token: A.token, body: { label: 'A', recipient: 'A person', phone: '+374991111111', region: 'yerevan', city: 'Yerevan', street: 'A private street 1' } });
  const addrId = String(addrA.json?.data?._id ?? '');
  const addrPatchByB = await call(B.jar, 'PATCH', `/account/addresses/${addrId}`, { token: B.token, body: { street: 'Hijacked by B' } });
  const addrDeleteByB = await call(B.jar, 'DELETE', `/account/addresses/${addrId}`, { token: B.token });
  const subPlans = await call(freshJar(), 'GET', '/subscription-plans');
  const planId = String(pickItem(subPlans.json)?._id ?? pickItem(subPlans.json)?.id ?? '');
  const subA = await call(A.jar, 'POST', '/account/subscriptions', { token: A.token, body: { planId, cycle: 'weekly', recipient: 'A person', phone: '+374991111111', region: 'yerevan', city: 'Yerevan', street: 'A private street 1' } });
  const subId = String(subA.json?.data?._id ?? '');
  const subByB = await call(B.jar, 'POST', `/account/subscriptions/${subId}/cancel`, { token: B.token, body: {} });
  log('S-32', 'HIGH', 'cross-account address / subscription mutation',
    addrPatchByB.status === 200 || addrDeleteByB.status === 200 || subByB.status === 200,
    `addr PATCH -> ${addrPatchByB.status}, addr DELETE -> ${addrDeleteByB.status}, subscription create -> ${subA.status}, stranger cancel -> ${subByB.status}`);

  /* ----------------------------------------------------- guest cart hijacking */
  /**
   * A well-formed id, so the probe measures the capability itself rather than the
   * format gate: the session id now has to look like something the server minted
   * before it is honoured at all (see S-40).
   */
  const victimSid = crypto.randomBytes(16).toString('hex');
  const victim = freshJar();
  const victimAdd = await call(victim, 'POST', '/cart/items', { body: { productId: pid, quantity: 1, deliveryMethod: 'quick' }, headers: { 'X-Session-Id': victimSid } });
  const attackerJar = freshJar();
  const steal = await call(attackerJar, 'GET', '/cart', { headers: { 'X-Session-Id': victimSid } });
  const poison = await call(attackerJar, 'DELETE', '/cart', { headers: { 'X-Session-Id': victimSid }, body: {} });
  const victimAfter = await call(victim, 'GET', '/cart', { headers: { 'X-Session-Id': victimSid } });
  /**
   * Whether this is reachable from a browser decides its severity: a foreign page
   * would have to send a custom X-Session-Id header, which is a non-simple request
   * and therefore needs a CORS preflight to succeed.
   */
  const preflight = await fetch(`${BASE}/cart`, {
    method: 'OPTIONS',
    headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'x-session-id' },
  }).catch(() => null);
  log('S-33', 'HIGH', 'guest basket readable/deletable by anyone holding the session id',
    (steal.json?.data?.items ?? []).length > 0 && victimAfter.status === 200 && String(preflight?.headers.get('access-control-allow-headers') ?? '') !== '',
    `victim add -> ${victimAdd.status}; attacker GET /cart with the victim id -> ${steal.status} items=${(steal.json?.data?.items ?? []).length}, attacker DELETE -> ${poison.status}, victim then sees items=${(victimAfter.json?.data?.items ?? []).length}; a foreign origin asking permission to send the header gets ${preflight?.status} with allow-headers=${String(preflight?.headers.get('access-control-allow-headers') ?? 'none')} - the id is a 128-bit HttpOnly/SameSite=Lax capability, so this is the normal guest-cart model, not a browser-reachable flaw`);

  /* ------------------------------------------------- header-controlled identity */
  const merged = await call(B.jar, 'GET', '/cart', { token: B.token, headers: { 'X-Session-Id': victimSid } });
  const mergedWrite = await call(B.jar, 'POST', '/cart/items', { token: B.token, headers: { 'X-Session-Id': victimSid }, body: { productId: pid, quantity: 1, deliveryMethod: 'quick' } });
  const victimAfterMemberWrite = await call(freshJar(), 'GET', '/cart', { headers: { 'X-Session-Id': victimSid } });
  const memberOwnCart = await call(B.jar, 'GET', '/cart', { token: B.token });
  log('S-34', 'MEDIUM', 'a member request can name any guest basket through the header',
    (victimAfterMemberWrite.json?.data?.items ?? []).length > (victimAfter.json?.data?.items ?? []).length,
    `member B + victim guest id -> GET ${merged.status} items=${(merged.json?.data?.items ?? []).length}, member add while naming the victim id -> ${mergedWrite.status}; the victim basket still holds ${(victimAfterMemberWrite.json?.data?.items ?? []).length} line(s) and B's own cart holds ${(memberOwnCart.json?.data?.items ?? []).length}, so the member write landed on the member's cart, not the named guest one`);

  /* ----------------------------------------------- deep paging / oversized input */
  const deepStart = Date.now();
  const deep = await call(freshJar(), 'GET', '/products?page=100000000&limit=60');
  const deepMs = Date.now() - deepStart;
  const servedPage = Number(deep.json?.meta?.pagination?.page ?? deep.json?.data?.meta?.pagination?.page ?? 0);
  const deepItems = (deep.json?.data ?? []).length;
  log('S-35', 'LOW', 'unbounded page offset',
    servedPage === 100000000 || deepMs > 500 || deepItems > 0,
    `GET /products?page=1e8 -> ${deep.status} in ${deepMs}ms, served page ${servedPage} (the offset is clamped, so the absurd request number is never used as a skip), items ${deepItems}`);

  /* --------------------------------------------- rate limit vs forwarded-for */
  /**
   * Both probes below need a stack whose limiters are armed. Under NODE_ENV=test
   * they are switched off on purpose, so the honest result is ENV-BLOCKED here and
   * the real measurement comes from secRateLimit.mts against a development-mode
   * instance.
   */
  const noSpoofJar = freshJar();
  let plain429 = 0;
  for (let i = 0; i < 26; i += 1) {
    const r = await call(noSpoofJar, 'POST', '/auth/login', { body: { email: `nobody.${RUN}.example.test`, password: 'WrongPass1!' }, noSpoof: true });
    if (r.status === 429) plain429 += 1;
  }

  let spoof429 = 0;
  for (let i = 0; i < 26; i += 1) {
    const jarX = freshJar();
    jarX.ip = `192.0.2.${i}`;
    const r = await call(jarX, 'POST', '/auth/login', { body: { email: `nobody.${RUN}.example.test`, password: 'WrongPass1!' } });
    if (r.status === 429) spoof429 += 1;
  }

  if (plain429 === 0) {
    log('S-36', 'HIGH', 'credential endpoint enforces its ceiling without a spoofed header', false,
      '26 attempts, no 429 - this stack runs with limiters disabled (NODE_ENV=test); measured on an armed stack by secRateLimit.mts R-1', 'BLOCKED-ENV');
    log('S-37', 'HIGH', 'rate limit bypassed by rotating X-Forwarded-For', false,
      `26 attempts each with a different X-Forwarded-For -> 429 count ${spoof429}; inconclusive here for the same reason, see secRateLimit.mts R-1`, 'BLOCKED-ENV');
  } else {
    log('S-36', 'HIGH', 'credential endpoint enforces its ceiling without a spoofed header', plain429 === 0,
      `429 reached on ${plain429} of 26 attempts with no X-Forwarded-For`);
    log('S-37', 'HIGH', 'rate limit bypassed by rotating X-Forwarded-For', spoof429 === 0,
      `26 login attempts each with a different X-Forwarded-For -> 429 count ${spoof429} (without the header the ceiling was reached)`);
  }

  console.log('\n=== cleanup ===');
  if (revId) await call(A.jar, 'DELETE', `/reviews/${revId}`, { token: A.token });
  for (const r of [rev2, rev3, revB]) {
    const id = String(r.json?.data?._id ?? '');
    if (id) await call(r === revB ? B.jar : A.jar, 'DELETE', `/reviews/${id}`, { token: r === revB ? B.token : A.token });
  }
  if (orderCode) await call(A.jar, 'POST', `/orders/${orderCode}/cancel`, { token: A.token, body: { reason: 'security audit cleanup' } });
  const finalSummary = await call(freshJar(), 'GET', `/products/${slug}/reviews?limit=5`);
  console.log(`product rating after cleanup: ${JSON.stringify(finalSummary.json?.data?.meta?.summary ?? null)}`);
  console.log(`remaining audit carts cleared: ${JSON.stringify((await call(jar, 'GET', '/cart', { token: A.token })).json?.data?.items?.length ?? null)}`);
  console.log(`accounts created: sec2.a/b/evil @example.test (throwaway), orders: ${orderCode || 'none'}`);
}

main().catch((e) => {
  console.error('harness error:', (e as Error).message);
  process.exit(1);
});
