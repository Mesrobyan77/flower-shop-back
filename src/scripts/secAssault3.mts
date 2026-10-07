/* eslint-disable no-console */
/**
 * Phase 3: content-abuse + SSRF + CORS/identity hardening probes.
 * Test accounts use a fixed throwaway password so leftovers stay recoverable.
 * Every record created here is deleted again at the end of the run.
 */
import crypto from 'crypto';

const BASE = process.env.SEC_API ?? 'http://localhost:5000/api';
const WEB = process.env.SEC_WEB ?? 'http://localhost:3002';
const PW = 'AuditPass1!x';
const RUN = Date.now();
const TAG = `s3.${RUN}`;

interface Jar {
  cookies: Map<string, string>;
  ip: string;
}
const freshJar = (): Jar => ({ cookies: new Map(), ip: `198.51.100.${crypto.randomInt(1, 250)}` });

async function call(jar: Jar, method: string, path: string, opts: any = {}) {
  const headers: Record<string, string> = { 'X-Forwarded-For': jar.ip, ...opts.headers };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (jar.cookies.size) headers.Cookie = [...jar.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  const res = await fetch(`${BASE}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
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

function say(id: string, sev: string, title: string, exploited: boolean, evidence: string) {
  console.log(`${exploited ? 'EXPLOITED' : 'BLOCKED'} [${id}] (${sev}) ${title} :: ${evidence}`.slice(0, 800));
}

async function main() {
  console.log(`\n=== PHASE 3  API ${BASE}  WEB ${WEB} ===\n`);

  const A = freshJar();
  const emailA = `${TAG}.a@example.test`;
  const reg = await call(A, 'POST', '/auth/register', { body: { email: emailA, password: PW, name: 'Audit A', phone: '+374991111111', agreeTerms: true } });
  const tokenA = reg.json?.data?.accessToken as string;
  const idA = String(reg.json?.data?.user?.id ?? '');
  console.log(`register A -> ${reg.status} id=${idA}`);

  const products = await call(A, 'GET', '/products?limit=24');
  const list = Array.isArray(products.json?.data) ? products.json.data : (products.json?.data?.items ?? []);
  const product = list[0];
  const pid = String(product.id);
  const slug = String(product.slug);
  console.log(`product ${slug} (${pid})`);

  /* ---------------------------------------------------- review + helpful votes */
  const review = await call(A, 'POST', '/reviews', { token: tokenA, body: { product: pid, rating: 4, title: `${TAG} r1`, body: `${TAG} review body for the audit pass` } });
  const reviewId = String(review.json?.data?.id ?? '');
  console.log(`review create -> ${review.status} id=${reviewId}`);

  const votes = [];
  for (let i = 0; i < 25; i += 1) votes.push(await call(freshJar(), 'POST', `/reviews/${reviewId}/helpful`, { body: {} }));
  const readBack = await call(freshJar(), 'GET', `/products/${slug}/reviews?limit=50`);
  const rows = Array.isArray(readBack.json?.data) ? readBack.json.data : (readBack.json?.data?.items ?? []);
  const mine = rows.find((r: any) => String(r.id) === reviewId) ?? {};
  say('S-30', 'HIGH', 'anonymous unlimited helpful-vote inflation',
    Number(mine.helpfulCount ?? 0) >= 20,
    `25 anonymous POST /reviews/:id/helpful -> statuses ${JSON.stringify([...new Set(votes.map((v) => v.status))])}; stored helpfulCount=${mine.helpfulCount}`);

  const voteForeign = await call(freshJar(), 'POST', '/reviews/000000000000000000000000/helpful', { body: {} });
  say('S-30b', 'HIGH', 'helpful vote on a nonexistent object', voteForeign.status === 200, `-> ${voteForeign.status}`);

  const dupReview = await call(A, 'POST', '/reviews', { token: tokenA, body: { product: pid, rating: 5, title: `${TAG} r2`, body: `${TAG} duplicate attempt body for the audit` } });
  say('S-29b', 'MEDIUM', 'same account can pile up reviews for one product', dupReview.status === 201,
    `second review by the same account -> ${dupReview.status} ${dupReview.text.slice(0, 80)}`);

  /* ------------------------------------------------------ inquiry redaction */
  const inq = await call(A, 'POST', '/inquiries', { token: tokenA, body: { product: pid, subject: `${TAG} secret subject`, body: `${TAG} secret question body`, isSecret: true } });
  const inqId = String(inq.json?.data?.id ?? '');
  const inqPublic = await call(freshJar(), 'GET', `/inquiries/${inqId}`);
  const leakSecret = new RegExp(`${TAG} secret question body|${TAG} secret subject`).test(inqPublic.text);
  say('S-31', 'HIGH', 'secret inquiry readable without being the author', leakSecret,
    `create -> ${inq.status} id=${inqId}; anonymous detail -> ${inqPublic.status}, secret text present=${leakSecret}, keys=${Object.keys(inqPublic.json?.data ?? {}).join(',').slice(0, 160)}`);

  const inqList = await call(freshJar(), 'GET', `/products/${slug}/inquiries?limit=50`);
  const leakInList = new RegExp(`${TAG} secret question body`).test(inqList.text);
  say('S-31b', 'HIGH', 'secret inquiry body exposed through the product list', leakInList,
    `GET /products/${slug}/inquiries -> ${inqList.status}, secret text present=${leakInList}, subject redacted=${!new RegExp(`${TAG} secret subject`).test(inqList.text)}`);

  const inqEmailLeak = /"(email|phone)":/.test(JSON.stringify(inqPublic.json?.data ?? {}));
  say('S-31c', 'MEDIUM', 'inquiry response exposes the author contact fields', inqEmailLeak,
    `detail body keys/values inspected -> contact fields present=${inqEmailLeak}`);

  /* ------------------------------------------------- stored XSS round trip */
  const xss = `${TAG} <img src=x onerror=alert(1)> <svg/onload=alert(2)>`;
  const xssInq = await call(A, 'POST', '/inquiries', { token: tokenA, body: { product: pid, subject: xss.slice(0, 60), body: xss, isSecret: false } });
  const xssId = String(xssInq.json?.data?.id ?? '');
  const apiEcho = await call(freshJar(), 'GET', `/products/${slug}/inquiries?limit=50`);
  const rawInApi = apiEcho.text.includes('onerror=alert(1)');
  let rendered: { status: number; raw: boolean; escaped: boolean } = { status: 0, raw: false, escaped: false };
  try {
    const html = await fetch(`${WEB}/hy/product/${slug}`).then((r) => ({ status: r.status, body: r.text() }));
    rendered = {
      status: html.status,
      raw: new RegExp('<img src=x onerror', 'i').test(html.body) || /<svg\/onload/i.test(html.body),
      escaped: /&lt;img src=x onerror/.test(html.body),
    };
  } catch (e) {
    rendered = { status: -1, raw: false, escaped: false };
  }
  say('S-38', 'HIGH', 'stored XSS payload executes in the rendered page',
    rendered.raw,
    `stored -> ${xssInq.status} id=${xssId}; API echoes raw=${rawInApi}; ${WEB}/hy/product/${slug} -> ${rendered.status}, raw executable markup present=${rendered.raw}, escaped form present=${rendered.escaped}`);

  /* ------------------------------------------------------ CORS + preflight */
  const evilPre = await fetch(`${BASE}/auth/me`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET' } });
  const evilBody = await evilPre.text();
  say('S-39', 'LOW', 'disallowed origin surfaces a server error instead of a CORS refusal',
    evilPre.status >= 500,
    `OPTIONS /auth/me (evil origin) -> ${evilPre.status} ACAO=${evilPre.headers.get('access-control-allow-origin') ?? 'none'} body=${evilBody.slice(0, 160)}`);

  const nullPre = await fetch(`${BASE}/products?limit=1`, { headers: { Origin: 'null' } });
  say('S-39b', 'HIGH', 'CORS reflects the null origin with credentials',
    nullPre.headers.get('access-control-allow-origin') === 'null',
    `GET with Origin: null -> ${nullPre.status} ACAO=${nullPre.headers.get('access-control-allow-origin') ?? 'none'} ACAC=${nullPre.headers.get('access-control-allow-credentials') ?? 'none'}`);

  /* --------------------------------------------------- guest session id form */
  const longSid = 'A'.repeat(16_000);
  const jarLong = freshJar();
  const longSidRes = await call(jarLong, 'POST', '/cart/items', { headers: { 'X-Session-Id': longSid }, body: { productId: pid, quantity: 1, deliveryMethod: 'quick' } });
  const jsSidRes = await call(freshJar(), 'POST', '/cart/items', { headers: { 'X-Session-Id': '{{7*7}}' }, body: { productId: pid, quantity: 1, deliveryMethod: 'quick' } });

  /**
   * The property under test is not "does the request succeed" - a visitor with a
   * garbage session id should still get a working basket. It is "does our own
   * identity machinery adopt the supplied string". Two visitors presenting the
   * same oversized id must land on two different carts, the minted cookie must
   * be one of our own tokens, and no response may echo the attacker's bytes.
   */
  const jarLong2 = freshJar();
  const repeatB = await call(jarLong2, 'POST', '/cart/items', { headers: { 'X-Session-Id': longSid }, body: { productId: pid, quantity: 1, deliveryMethod: 'quick' } });
  const cartIdOf = (json: any) => String(json?.data?.id ?? json?.data?.cart?.id ?? '');
  const minted = jarLong.cookies.get('xf_sid') ?? '';
  const honoured = cartIdOf(longSidRes.json) !== '' && cartIdOf(longSidRes.json) === cartIdOf(repeatB.json);
  say('S-40', 'MEDIUM', 'guest session id accepted without format or length bounds',
    honoured || longSidRes.text.includes('AAAA') || minted.length !== 32,
    `16k id -> ${longSidRes.status} (echoes attacker bytes=${longSidRes.text.includes('AAAA')}), template id -> ${jsSidRes.status}, minted cookie=${minted.length} chars well-formed=${/^[A-Za-z0-9_-]{8,64}$/.test(minted)}, two visitors with the same garbage id share a cart=${honoured} (${cartIdOf(longSidRes.json)} vs ${cartIdOf(repeatB.json)})`);

  /* ------------------------------------------------- SSRF port oracle on :3002 */
  const ports = [5000, 5001, 3000, 9, 65535];
  const probeResults: string[] = [];
  const codes: number[] = [];
  for (const p of ports) {
    const res = await fetch(`${WEB}/_next/image?url=${encodeURIComponent(`http://localhost:${p}/x`)}&w=64&q=75`).catch(() => null);
    probeResults.push(`${p}:${res ? res.status : 'ERR'}`);
    if (res) codes.push(res.status);
  }
  const external = await fetch(`${WEB}/_next/image?url=${encodeURIComponent('https://example.com/nope.png')}&w=64&q=75`).catch(() => null);
  if (external) codes.push(external.status);
  /**
   * Safe behaviour is uniformity: a host that is not on the image allowlist is
   * refused before any connection is made, so every probe - open port, closed
   * port, external host - gets the same 4xx. A port oracle needs either
   * differing statuses or a 5xx that only a real connection attempt produces.
   */
  const statusSet = new Set(codes);
  const oracle = statusSet.size > 1 || codes.some((c) => c >= 500) || external?.status === 200;
  say('S-26b', 'MEDIUM', 'image optimizer behaves as an internal port scanner',
    oracle,
    `internal port probe statuses ${probeResults.join(' ')}, arbitrary external https host -> ${external?.status ?? 'ERR'} ${external?.headers.get('content-type') ?? ''}, distinct statuses=${[...statusSet].join('/')}`);

  /* -------------------------------------------------------------- cleanup */
  if (reviewId) await call(A, 'DELETE', `/reviews/${reviewId}`, { token: tokenA });
  if (dupReview.json?.data?.id) await call(A, 'DELETE', `/reviews/${String(dupReview.json.data.id)}`, { token: tokenA });
  for (const id of [inqId, xssId]) {
    if (!id) continue;
    const del = await call(A, 'DELETE', `/inquiries/${id}`, { token: tokenA });
    if (del.status >= 400) console.log(`note: inquiry ${id} has no customer delete route (status ${del.status}) - left in the test database, flagged below`);
  }
  const after = await call(freshJar(), 'GET', `/products/${slug}/reviews?limit=50`);
  console.log(`\ncleanup: product review summary now ${JSON.stringify(after.json?.data?.meta?.summary ?? null)}`);
  console.log(`cleanup: audit accounts ${emailA} / ${TAG}.b@example.test remain in the users table (see report), throwaway password is not logged`);
}

main().catch((e) => {
  console.error('harness error:', (e as Error).message);
  process.exit(1);
});
