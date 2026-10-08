/* eslint-disable no-console */
/**
 * Checkpoint D security harness.
 *
 * Exercises the hardening added for this checkpoint against a RUNNING API and
 * asserts the negative outcomes, not the intent:
 *
 *   1. no configured secret ever appears in a response body or in the server log
 *   2. token algorithm pinning   alg:none / HS512 / wrong-secret / expired -> 401,
 *                                with a positive control proving the probe works
 *   3. authorization             admin routes need an admin, nothing escapes its owner
 *   4. mass assignment           PATCH /auth/me cannot touch role, points, spend, password
 *   5. upload surface            declared type must match the bytes, size/count limits
 *                                are 4xx, traversal characters never survive into a key
 *   6. cookies and headers       HttpOnly always, SameSite as configured (None is
 *                                never emitted without Secure, and no cookie is
 *                                widened to a Domain), Secure in production,
 *                                no CORS echo for a foreign origin, generic 5xx
 *   7. rate limits               active in production, off only in NODE_ENV=test
 *
 * Two modes: against a development/test deployment (default) and against a
 * production deployment (`--prod`, adds the Secure-cookie, 5xx-hygiene and
 * rate-limit assertions). Secrets used for the token probes come from this
 * process's own environment; when they are absent those probes report SKIP instead
 * of pretending to have run. Nothing here is ever printed or written down.
 *
 * Run the API first, e.g.
 *   npm run dev:memory             -> npm run security:check
 *   NODE_ENV=production node dist/server.js -> npm run security:check:prod
 */
import { readFileSync } from 'fs';
import jwt from 'jsonwebtoken';
import { bufferMatchesMimeType, sniffImageType } from '../utils/imageType';
import { slugify } from '../utils/slug';

const BASE = process.env.SMOKE_API ?? 'http://localhost:5000/api';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@anahit-flower.am';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!';
const PROD = process.argv.includes('--prod');
const LOG_FILE = process.env.SECURITY_LOG_FILE ?? '';

const ACCESS_SECRET = process.env.JWT_SECRET ?? '';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? '';
const CLOUDINARY_SECRET = process.env.CLOUDINARY_API_SECRET ?? '';
const MONGO_PASSWORD = (process.env.MONGODB_URI ?? '').match(/:\/\/[^:/@]+:([^@/]+)@/)?.[1] ?? '';

let passed = 0;
let failed = 0;
let skipped = 0;

const runTag = Date.now();
/** Every response body we may have leaked a secret into. */
const bodies: { path: string; text: string }[] = [];

interface CallOptions {
  method?: string;
  body?: unknown;
  token?: string;
  origin?: string;
  form?: FormData;
  sessionId?: string;
}

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
    return;
  }
  failed += 1;
  console.log(`  FAIL  ${label}`);
  if (detail !== undefined) console.log('        ', JSON.stringify(detail).slice(0, 300));
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

async function call(path: string, options: CallOptions = {}) {
  const headers: Record<string, string> = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.origin) headers.Origin = options.origin;
  if (options.sessionId) headers['x-session-id'] = options.sessionId;

  let bodyInit: string | FormData | undefined;
  if (options.form) {
    bodyInit = options.form;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    bodyInit = JSON.stringify(options.body);
  }

  const response = await fetch(`${BASE}${path}`, { method: options.method ?? 'GET', headers, body: bodyInit });
  const text = await response.text();
  bodies.push({ path, text });

  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  return {
    status: response.status,
    body: parsed as any,
    headers: response.headers,
    setCookie: response.headers.getSetCookie?.() ?? [],
  };
}

function fileForm(field: string, name: string, type: string, bytes: Buffer, extra = 1): FormData {
  const form = new FormData();
  for (let i = 0; i < extra; i += 1) {
    form.append(field, new Blob([new Uint8Array(bytes)], { type }), name);
  }
  return form;
}

/* ------------------------------ fixtures -------------------------------- */

async function newMember(tag: string) {
  const email = `sec_${runTag}_${tag}@example.com`;
  const res = await call('/auth/register', {
    method: 'POST',
    body: { email, password: 'Secret123', name: 'Security Tester', phone: '+374 99 111222', agreeTerms: true },
  });
  if (res.status !== 201) throw new Error(`registration failed: ${JSON.stringify(res.body)}`);
  return {
    email,
    token: res.body.data.accessToken as string,
    id: res.body.data.user.id as string,
    setCookie: res.setCookie,
  };
}

async function deliveryContext() {
  const options = await call('/delivery/options');
  const quick = options.body.data.methods.find((m: any) => m.method === 'quick');
  return { requestedDate: quick.calendar.find((d: any) => d.available).date as string, timeSlot: quick.timeSlots[0] as string };
}

/**
 * An orderable product plus a valid selection for its required option groups -
 * some catalogue entries want a size or a card message before they can go in a
 * basket. Delivery groups are left to the API, which fills them from the
 * dedicated delivery fields.
 */
async function orderableProduct() {
  const listing = await call('/products?limit=20');
  const items = (listing.body.data ?? []) as any[];
  const deliveryGroups = new Set(['delivery_method', 'delivery_date', 'delivery_time']);

  for (const item of items) {
    const required = ((item.optionGroups ?? []) as any[]).filter((g) => g.required && !deliveryGroups.has(g.key));
    const options: Record<string, unknown>[] = [];
    let usable = true;

    for (const group of required) {
      const choice = ((group.options ?? []) as any[]).find((o) => o.isAvailable !== false);
      if (choice) options.push({ groupKey: group.key, optionKey: choice.key, value: choice.key });
      else if (group.type === 'text' || group.type === 'textarea') options.push({ groupKey: group.key, value: 'Security harness' });
      else if (group.type === 'date') options.push({ groupKey: group.key, value: new Date().toISOString().slice(0, 10) });
      else usable = false;
    }

    if (usable) return { id: String(item.id), slug: String(item.slug), options };
  }

  throw new Error('no orderable product in the catalogue - seed the database first');
}

function base64url(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/* ------------------------- 2. token hardening ---------------------------- */

async function tokenProbes(adminToken: string, memberId: string) {
  section('2. Token handling - one algorithm, one issuer, one token type');

  const header = JSON.parse(Buffer.from(adminToken.split('.')[0], 'base64url').toString('utf8')) as { alg?: string };
  check('the API issues HS256 tokens only', header.alg === 'HS256', header);

  if (!ACCESS_SECRET) {
    for (const label of ['unsigned `alg: none`', 'HS512', 'wrong secret', 'expired', 'refresh-as-access']) {
      skip(`${label} token is rejected`, 'JWT_SECRET is not in this process environment');
    }
    return;
  }

  const claims = {
    sub: memberId,
    email: `sec_${runTag}@example.com`,
    role: 'admin',
    tokenType: 'access',
  };

  const unsigned = `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({ ...claims, exp: Math.floor(Date.now() / 1000) + 600 })}.`;
  const unsignedRes = await call('/auth/me', { token: unsigned });
  check('unsigned `alg: none` token is rejected', unsignedRes.status === 401, unsignedRes.body);

  const hs512 = jwt.sign(claims, ACCESS_SECRET, { algorithm: 'HS512', expiresIn: '10m' });
  const hs512Res = await call('/auth/me', { token: hs512 });
  check('HS512 token signed with the real secret is rejected (algorithm is pinned)', hs512Res.status === 401, hs512Res.body);

  const wrongSecret = jwt.sign(claims, `${ACCESS_SECRET}-not-the-real-secret`, { algorithm: 'HS256', expiresIn: '10m' });
  const wrongSecretRes = await call('/auth/me', { token: wrongSecret });
  check('token signed with a different secret is rejected', wrongSecretRes.status === 401, wrongSecretRes.body);

  const expired = jwt.sign(
    { ...claims, exp: Math.floor(Date.now() / 1000) - 60 },
    ACCESS_SECRET,
    { algorithm: 'HS256' },
  );
  const expiredRes = await call('/auth/me', { token: expired });
  check('expired token is rejected', expiredRes.status === 401, expiredRes.body);

  const refreshAsAccess = jwt.sign({ ...claims, tokenType: 'refresh' }, ACCESS_SECRET, { algorithm: 'HS256', expiresIn: '10m' });
  const refreshAsAccessRes = await call('/auth/me', { token: refreshAsAccess });
  check('a refresh token cannot act as an access token', refreshAsAccessRes.status === 401, refreshAsAccessRes.body);

  /**
   * Positive control: the same claims, correctly signed, are accepted. Without it
   * every 401 above could just mean the endpoint is broken.
   */
  const control = jwt.sign(claims, ACCESS_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
  const controlRes = await call('/admin/stats', { token: control });
  check('control: a correctly signed admin token is accepted', controlRes.status === 200, controlRes.body?.message ?? controlRes.body);
}

/* -------------------------- 3. authorization ----------------------------- */

async function authzProbes(adminToken: string, member: { token: string; id: string; email: string }) {
  section('3. Authorization - ownership and role gates');

  const anonymous = await Promise.all([
    call('/auth/me'),
    call('/orders'),
    call('/admin/stats'),
    call('/admin/orders'),
    call('/account/summary'),
  ]);
  check('anonymous access to private endpoints is 401', anonymous.every((r) => r.status === 401), statuses(anonymous));

  const asMember = await Promise.all([
    call('/admin/stats', { token: member.token }),
    call('/admin/orders', { token: member.token }),
    call('/admin/users', { token: member.token }),
    call('/admin/settings', { token: member.token }),
    call('/admin/media', { token: member.token }),
  ]);
  check('a member token is refused on every admin endpoint', asMember.every((r) => r.status === 403), statuses(asMember));

  const stranger = await newMember('stranger');
  const product = await orderableProduct();
  const delivery = await deliveryContext();

  const added = await call('/cart/items', {
    method: 'POST',
    token: member.token,
    body: {
      productId: product.id,
      quantity: 1,
      options: product.options,
      deliveryMethod: 'quick',
      deliveryDate: delivery.requestedDate,
      timeSlot: delivery.timeSlot,
    },
  });
  check('the member can build a basket', added.status === 201, added.body);

  const placed = await call('/orders/checkout', {
    method: 'POST',
    token: member.token,
    body: {
      customer: { name: 'Security Tester', email: member.email, phone: '+374 99 111222' },
      delivery: {
        method: 'quick',
        recipient: 'Recipient',
        phone: '+374 91 000000',
        region: 'yerevan',
        city: 'Yerevan',
        street: 'Hanrapetutyan 25',
        requestedDate: delivery.requestedDate,
        timeSlot: delivery.timeSlot,
      },
      pointsUsed: 0,
      agreeTerms: true,
    },
  });
  check('the member can place an order', placed.status === 201, placed.body);

  const code = placed.body?.data?.order?.code ?? '';
  const owner = await call(`/orders/${code}`, { token: member.token });
  const intruder = await call(`/orders/${code}`, { token: stranger.token });
  const intruderCancel = await call(`/orders/${code}/cancel`, { method: 'POST', token: stranger.token, body: { reason: 'not mine' } });
  const guestLookup = await call('/orders/lookup', { method: 'POST', body: { code, email: 'not-the-buyer@example.com' } });

  check('the owner can read the order', owner.status === 200, owner.body?.message);
  check('another member cannot read it by code', intruder.status === 404, intruder.body);
  check('another member cannot cancel it', intruderCancel.status === 404, intruderCancel.body);
  check('guest lookup needs the matching email', guestLookup.status === 404, guestLookup.body);

  const me = await call('/auth/me', { token: adminToken });
  const adminId = me.body?.data?.id ?? '';
  const selfDemote = await call(`/admin/users/${adminId}/role`, { method: 'PATCH', token: adminToken, body: { role: 'user' } });
  const selfDeactivate = await call(`/admin/users/${adminId}/active`, { method: 'PATCH', token: adminToken, body: { isActive: false } });
  check('an admin cannot demote themselves', selfDemote.status === 400, selfDemote.body);
  check('an admin cannot deactivate themselves', selfDeactivate.status === 400, selfDeactivate.body);
}

/* -------------------------- 4. mass assignment --------------------------- */

async function massAssignmentProbes(member: { token: string; email: string }) {
  section('4. Mass assignment - profile updates stay inside the whitelist');

  const before = await call('/account/summary', { token: member.token });
  const beforeMe = await call('/auth/me', { token: member.token });
  const attempt = await call('/auth/me', {
    method: 'PATCH',
    token: member.token,
    body: {
      name: 'Renamed Tester',
      role: 'admin',
      points: 999999,
      totalSpend: 99999999,
      isActive: false,
      grade: 'tree',
      wishlist: [],
      password: 'Hijacked123',
    },
  });
  const after = await call('/auth/me', { token: member.token });
  const summary = await call('/account/summary', { token: member.token });

  check('the profile update is accepted', attempt.status === 200, attempt.body);
  check('the whitelisted field did change', after.body?.data?.name === 'Renamed Tester', after.body?.data?.name);
  check('role cannot be escalated', after.body?.data?.role === 'user', after.body?.data?.role);
  check('points cannot be injected', summary.body?.data?.points === before.body?.data?.points, {
    before: before.body?.data?.points,
    after: summary.body?.data?.points,
  });
  check('lifetime spend cannot be injected', summary.body?.data?.totalSpend === before.body?.data?.totalSpend, {
    before: before.body?.data?.totalSpend,
    after: summary.body?.data?.totalSpend,
  });
  check('the grade cannot be forced', after.body?.data?.grade === beforeMe.body?.data?.grade, {
    before: beforeMe.body?.data?.grade,
    after: after.body?.data?.grade,
  });
  check('the account cannot be deactivated through the profile', after.status === 200, after.body?.message);

  const hijack = await call('/auth/login', { method: 'POST', body: { email: member.email, password: 'Hijacked123' } });
  const original = await call('/auth/login', { method: 'POST', body: { email: member.email, password: 'Secret123' } });
  check('the attempted password was never written', hijack.status === 401, hijack.body?.message);
  check('the original password still works', original.status === 200, original.body?.message);
}

/* -------------------------- 5. upload surface ---------------------------- */

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
const GIF = Buffer.from('GIF89a', 'latin1');
const WEBP = Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.from([0x24, 0x00, 0x00, 0x00]), Buffer.from('WEBP', 'latin1')]);
const AVIF = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x18]), Buffer.from('ftypavif', 'latin1')]);
const SVG = Buffer.from('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>', 'utf8');
const HTML = Buffer.from('<!doctype html><html><body>not an image</body></html>', 'utf8');
const SCRIPT = Buffer.from('<?php system($_GET["c"]); ?>', 'utf8');

function uploadTypeProbes() {
  section('5. Upload surface - the bytes decide, not the part header');

  check('the sniffer accepts a PNG', sniffImageType(PNG) === 'image/png', sniffImageType(PNG));
  check('the sniffer accepts a JPEG', sniffImageType(JPEG) === 'image/jpeg', sniffImageType(JPEG));
  check('the sniffer accepts a GIF', sniffImageType(GIF) === 'image/gif', sniffImageType(GIF));
  check('the sniffer accepts a WebP', sniffImageType(WEBP) === 'image/webp', sniffImageType(WEBP));
  check('the sniffer accepts an AVIF', sniffImageType(AVIF) === 'image/avif', sniffImageType(AVIF));
  check('the sniffer accepts real SVG', sniffImageType(SVG) === 'image/svg+xml', sniffImageType(SVG));
  check('the sniffer refuses HTML', sniffImageType(HTML) === null, sniffImageType(HTML));
  check('the sniffer refuses a script payload', sniffImageType(SCRIPT) === null, sniffImageType(SCRIPT));
  check('a declared type has to match the bytes', !bufferMatchesMimeType(SCRIPT, 'image/png') && bufferMatchesMimeType(PNG, 'image/png'));
  check('a JPEG cannot be smuggled in as a PNG', !bufferMatchesMimeType(PNG, 'image/jpeg'));

  /**
   * Traversal proof without uploading anything: the Cloudinary public id is built
   * from `path.basename` plus this slugifier, so separators cannot survive it.
   */
  check('path separators cannot survive into an object key', slugify('../../etc/passwd') === 'etc-passwd', slugify('../../etc/passwd'));
  check('backslash traversal cannot survive either', slugify('..\\..\\evil.svg') === 'evil-svg', slugify('..\\..\\evil.svg'));
  check('a bare traversal is reduced to nothing usable', slugify('../') === '', slugify('../'));
}

async function uploadHttpProbes(adminToken: string, memberToken: string) {
  const spoofed = await call('/admin/media/upload', { method: 'POST', token: adminToken, form: fileForm('files', 'payload.png', 'image/png', SCRIPT) });
  check('a script payload declared image/png is refused with 400', spoofed.status === 400, spoofed.body);

  const htmlSvg = await call('/admin/media/upload', { method: 'POST', token: adminToken, form: fileForm('files', 'payload.svg', 'image/svg+xml', HTML) });
  check('HTML declared as SVG is refused with 400', htmlSvg.status === 400, htmlSvg.body);

  const wrongType = await call('/admin/media/upload', { method: 'POST', token: adminToken, form: fileForm('files', 'notes.txt', 'text/plain', Buffer.from('hello')) });
  check('a non-image part type is refused with 400', wrongType.status === 400, wrongType.body);

  const anonymous = await call('/admin/media/upload', { method: 'POST', form: fileForm('files', 'payload.png', 'image/png', PNG) });
  const asMember = await call('/admin/media/upload', { method: 'POST', token: memberToken, form: fileForm('files', 'payload.png', 'image/png', PNG) });
  check('uploading without a token is 401', anonymous.status === 401, anonymous.body?.message);
  check('uploading as a member is 403', asMember.status === 403, asMember.body?.message);

  const tooMany = await call('/admin/media/upload', { method: 'POST', token: adminToken, form: fileForm('files', 'many.png', 'image/png', SCRIPT, 11) });
  check('more files than the cap is a client error, never a 500', [400, 413].includes(tooMany.status), tooMany.body);

  const oversize = Buffer.concat([PNG, Buffer.alloc(9 * 1024 * 1024)]);
  const tooBig = await call('/admin/media/upload', { method: 'POST', token: adminToken, form: fileForm('files', 'huge.png', 'image/png', oversize) });
  check('a file over the size cap is 413, never a 500', tooBig.status === 413, tooBig.body);
}

/* ---------------------- 6. cookies, headers, CORS, 5xx ------------------- */

function cookieFlags(setCookie: string[], name: string): string {
  const raw = setCookie.find((line) => line.startsWith(`${name}=`)) ?? '';
  return raw.split(';').slice(1).join(';').trim();
}

async function transportProbes() {
  section('6. Transport hardening - cookies, headers, CORS and 5xx hygiene');

  const login = await call('/auth/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  check('sign-in succeeds for the cookie probe', login.status === 200, login.body?.message);

  const refreshFlags = cookieFlags(login.setCookie, 'xf_refresh');
  const guestFlags = cookieFlags(login.setCookie, 'xf_sid');
  /**
   * SameSite is configuration, not a constant: a storefront on a different
   * registrable domain than the API has to run `None` (forced `Secure`) or the
   * browser never attaches the session cookie to the cross-site refresh. The
   * harness therefore asserts that what the API emits is what it was configured
   * to emit, plus the rules that no configuration may break.
   */
  const expectedSameSite = (process.env.COOKIE_SAMESITE ?? 'lax').toLowerCase();
  const secureExpected = expectedSameSite === 'none' || PROD || (process.env.COOKIE_SECURE ?? 'auto') === 'true';
  check('the refresh cookie is HttpOnly', /HttpOnly/i.test(refreshFlags), refreshFlags.replace(/=\S+/g, '=<redacted>'));
  check(`the refresh cookie is SameSite=${expectedSameSite}`, new RegExp(`SameSite=${expectedSameSite}`, 'i').test(refreshFlags), refreshFlags);
  check('the guest session cookie is HttpOnly', /HttpOnly/i.test(guestFlags), guestFlags.replace(/=\S+/g, '=<redacted>'));
  check(`the guest session cookie is SameSite=${expectedSameSite}`, new RegExp(`SameSite=${expectedSameSite}`, 'i').test(guestFlags), guestFlags);
  check('no cookie carries a Domain attribute (host-only)', !/(^|;)\s*Domain=/i.test(refreshFlags) && !/(^|;)\s*Domain=/i.test(guestFlags), {
    refresh: refreshFlags,
    guest: guestFlags,
  });
  check(
    secureExpected
      ? PROD || expectedSameSite === 'none'
        ? 'cookies are Secure where the policy or SameSite=None requires it'
        : 'cookies are Secure because COOKIE_SECURE=true asks for it'
      : 'cookies are not Secure outside production (plain-HTTP dev keeps working)',
    secureExpected
      ? /Secure/i.test(refreshFlags) && /Secure/i.test(guestFlags)
      : !/Secure/i.test(refreshFlags) && !/Secure/i.test(guestFlags),
    { prod: PROD, samesite: expectedSameSite, refresh: refreshFlags, guest: guestFlags },
  );

  const health = await call('/health');
  check('the response is marked nosniff', health.headers.get('x-content-type-options') === 'nosniff', health.headers.get('x-content-type-options'));
  check('framing is restricted', Boolean(health.headers.get('x-frame-options')), health.headers.get('x-frame-options'));
  check('HSTS is advertised', Boolean(health.headers.get('strict-transport-security')), health.headers.get('strict-transport-security'));
  check('the server does not advertise itself', !health.headers.get('x-powered-by'), health.headers.get('x-powered-by'));

  const foreignOrigin = await call('/health', { origin: 'https://evil.example' });
  check(
    'a foreign origin is never echoed back as allowed',
    foreignOrigin.headers.get('access-control-allow-origin') !== 'https://evil.example',
    foreignOrigin.headers.get('access-control-allow-origin'),
  );

  const allowedOrigin = process.env.SECURITY_ALLOWED_ORIGIN ?? '';
  if (!allowedOrigin) {
    skip('a configured origin is still allowed', 'SECURITY_ALLOWED_ORIGIN is not set');
  } else {
    const allowed = await call('/health', { origin: allowedOrigin });
    check('a configured origin is still allowed', allowed.headers.get('access-control-allow-origin') === allowedOrigin, allowed.headers.get('access-control-allow-origin'));
  }
}

async function serverErrorProbes(adminToken: string) {
  section('6b. Server errors - nothing internal reaches the caller');

  if (!PROD) {
    skip('an internal failure returns a generic message', 'needs --prod against a deployment without media storage');
    return;
  }

  const failing = await call('/admin/media/upload', { method: 'POST', token: adminToken, form: fileForm('files', 'valid.png', 'image/png', PNG) });
  check('the internal failure is a 500', failing.status === 500, failing.body);
  check('the 5xx message is generic', failing.body?.message === 'Internal server error', failing.body?.message);
  check('no stack trace is exposed', !('stack' in (failing.body ?? {})), Object.keys(failing.body ?? {}));
  check('no internal detail leaks into the 5xx body', !/cloudinary|media storage/i.test(JSON.stringify(failing.body ?? {})), failing.body);
}

/* ---------------------------- 7. rate limits ----------------------------- */

async function rateLimitProbes() {
  section('7. Rate limiting - enforced in production, skipped only under NODE_ENV=test');

  const burst = await Promise.all(
    Array.from({ length: 45 }, () =>
      call('/orders/lookup', { method: 'POST', body: { code: 'XF-19700101-AAAAA', email: 'nobody@example.com' } }),
    ),
  );
  const limited = burst.filter((r) => r.status === 429);

  if (PROD) {
    check('a burst is throttled in production', limited.length > 0, statuses(burst));
    check('the throttled response carries the RATE_LIMITED code', limited.every((r) => r.body?.code === 'RATE_LIMITED'), limited[0]?.body);
  } else {
    check('the limiter is skipped outside production so suites stay usable', limited.length === 0, statuses(burst));
  }
}

/* -------------------------- 8. secret hygiene ---------------------------- */

function secretHygiene() {
  section('8. Secret hygiene - nothing sensitive in a response or in the log');

  const secrets = (
    [
      ['JWT_SECRET', ACCESS_SECRET],
      ['JWT_REFRESH_SECRET', REFRESH_SECRET],
      ['CLOUDINARY_API_SECRET', CLOUDINARY_SECRET],
      ['the MongoDB password', MONGO_PASSWORD],
    ] as [string, string][]
  ).filter(([, value]) => value.length > 0);

  if (secrets.length === 0) {
    skip('no configured secret appears in a response body', 'no secret was passed to this process');
  } else {
    for (const [name, value] of secrets) {
      const hit = bodies.find((entry) => entry.text.includes(value));
      check(`no ${name} value appears in any of the ${bodies.length} response bodies`, !hit, hit?.path);
    }
  }

  if (!LOG_FILE) {
    skip('no configured secret appears in the API log', 'SECURITY_LOG_FILE is not set');
    return;
  }

  const log = readFileSync(LOG_FILE, 'utf8');
  for (const [name, value] of secrets) {
    check(`no ${name} value appears in the API log`, !log.includes(value));
  }
  check('the log never contains a credentialed connection string', !/mongodb(\+srv)?:\/\/[^:@/\s]+:[^@\s]+@/.test(log));
}

async function main() {
  const health = await call('/health');
  if (health.status !== 200) throw new Error(`the API is not answering at ${BASE} - start it first`);

  console.log(`\nCheckpoint D security harness against ${BASE}`);
  console.log(PROD ? 'Mode: production deployment' : 'Mode: development/test deployment');

  const login = await call('/auth/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  if (login.status !== 200) throw new Error(`admin login failed: ${JSON.stringify(login.body)}`);

  const adminToken = login.body.data.accessToken as string;
  const member = await newMember('member');

  await tokenProbes(adminToken, member.id);
  await authzProbes(adminToken, member);
  await massAssignmentProbes(member);
  uploadTypeProbes();
  await uploadHttpProbes(adminToken, member.token);
  await transportProbes();
  await serverErrorProbes(adminToken);
  await rateLimitProbes();
  secretHygiene();

  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/** Module scope on purpose: keeps this harness out of the globals of the other scripts. */
export {};
