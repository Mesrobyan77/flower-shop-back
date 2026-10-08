/* eslint-disable no-console */
/**
 * Focused refresh-token lifecycle suite (Checkpoint E1).
 *
 * Proves, against a running API: rotation invalidates the presented token,
 * a reused token is refused and mints nothing, logout revokes the session,
 * TTLs come from configuration, expired and pre-E1 tokens are rejected, and
 * of ten concurrent refreshes carrying one cookie exactly one succeeds.
 *
 * Also asserts the cookie transport on the wire (SameSite/Secure/Path/Domain as
 * configured, and the removal that logout sends for the same cookie): the
 * cross-site case behind a "login works, refresh 401s" production symptom, where the
 * token was valid all along and only the browser's cookie rules kept it from arriving.
 * The CORS pair that lets a cookie travel at all is probed from the API's own
 * allowlisted origin and from one that is not on the list.
 *
 * The suite refuses to run unless SMOKE_API names the API under test and
 * MONGODB_URI points at a LOCAL database, then verifies the API and the suite
 * really share that database - a mis-targeted run must fail loudly instead of
 * quietly writing anywhere else.
 *
 * Run the API first, then:
 *   SMOKE_API=http://localhost:5100/api  MONGODB_URI=<local uri>  npm run refresh:tests
 *
 * Never prints tokens, secrets, passwords or connection strings.
 */
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import mongoose, { Types } from 'mongoose';
import { env } from '../config/env';
import { REFRESH_COOKIE, resolveCookiePolicy } from '../config/cookiePolicy';
import { GUEST_COOKIE } from '../middlewares/guestSession';
import { Product } from '../models/Product';
import { RefreshSession } from '../models/RefreshSession';
import { User } from '../models/User';

const BASE = process.env.SMOKE_API ?? '';

let passed = 0;
let failed = 0;

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

interface HttpResult {
  status: number;
  body: any;
  setCookies: string[];
  headers: Record<string, string>;
}

interface CallOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  token?: string;
  cookie?: string;
  cookies?: Record<string, string>;
  /** Sends an `Origin` header, which is what turns a probe into a CORS request. */
  origin?: string;
}

async function call(path: string, options: CallOptions = {}): Promise<HttpResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.origin) headers.Origin = options.origin;
  const cookieParts: string[] = [];
  if (options.cookie) cookieParts.push(`${REFRESH_COOKIE}=${options.cookie}`);
  for (const [name, value] of Object.entries(options.cookies ?? {})) cookieParts.push(`${name}=${value}`);
  if (cookieParts.length) headers.Cookie = cookieParts.join('; ');

  const response = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const setCookies = response.headers.getSetCookie?.() ?? [];
  const text = await response.text();
  const headers_: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers_[key] = value;
  });
  return { status: response.status, body: text ? JSON.parse(text) : null, setCookies, headers: headers_ };
}

/** A browser's preflight: OPTIONS with the origin and the method it wants to use. */
async function preflight(path: string, origin: string, method = 'POST'): Promise<HttpResult> {
  const response = await fetch(`${BASE}${path}`, {
    method: 'OPTIONS',
    headers: { Origin: origin, 'Access-Control-Request-Method': method, 'Access-Control-Request-Headers': 'content-type' },
  });
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return { status: response.status, body: null, setCookies: response.headers.getSetCookie?.() ?? [], headers };
}

/** The value of a freshly set cookie, if `name` is among the Set-Cookie lines. */
function cookieOf(result: HttpResult, name: string): string | undefined {
  for (const line of result.setCookies) {
    const [pair] = line.split(';');
    const index = pair.indexOf('=');
    if (index > 0 && pair.slice(0, index).trim() === name) {
      const value = pair.slice(index + 1).trim();
      if (value) return value;
    }
  }
  return undefined;
}

function refreshCookieOf(result: HttpResult): string | undefined {
  return cookieOf(result, REFRESH_COOKIE);
}

function setCookieHeader(result: HttpResult, name = REFRESH_COOKIE): string | undefined {
  return result.setCookies.find((line) => line.startsWith(`${name}=`));
}

/**
 * One attribute of a Set-Cookie line: the value for `SameSite`/`Max-Age`, or the
 * string 'flag' for a valueless attribute like `HttpOnly`. Never returns the
 * cookie's own value - attributes are what this suite asserts on.
 */
function cookieAttr(line: string | undefined, name: string): string | undefined {
  if (!line) return undefined;
  const match = new RegExp(`(?:^|;)\\s*${name}(?:=([^;]*))?(?:;|$)`, 'i').exec(line);
  if (!match) return undefined;
  return match[1] === undefined ? 'flag' : match[1].trim();
}

/** `15m` / `30d` / `1h30m` -> milliseconds (test-side mirror of `ms`). */
function durationMs(value: string): number {
  const units: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  let total = 0;
  for (const [, amount, unit] of value.matchAll(/(\d+)([smhd])/g)) total += Number(amount) * units[unit];
  return total;
}

function tokenSpan(token: string): number | null {
  const claims = jwt.decode(token) as { exp?: number; iat?: number } | null;
  if (!claims?.exp || !claims?.iat) return null;
  return (claims.exp - claims.iat) * 1000;
}

function isLocalApi(value: string): boolean {
  try {
    const url = new URL(value);
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

function isLocalDatabase(value: string): boolean {
  return /^mongodb:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(value);
}

interface Session {
  userId: string;
  email: string;
  cookie: string;
  accessToken: string;
}

const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const TEST_PASSWORD = 'E1-Test-Passw0rd!'; // suite-only credential, never printed

async function register(tag: string, cookies?: Record<string, string>): Promise<Session> {
  const email = `e1-${runId}-${tag}@example.com`;
  const result = await call('/auth/register', {
    method: 'POST',
    body: { email, password: TEST_PASSWORD, name: `E1 ${tag}`, agreeTerms: true },
    cookies,
  });
  const cookie = refreshCookieOf(result);
  if (result.status !== 201 || !cookie || !result.body?.data?.accessToken) {
    console.error(`environment failure: register (${tag}) returned HTTP ${result.status}`);
    process.exit(1);
  }
  return { userId: result.body.data.user.id, email, cookie, accessToken: result.body.data.accessToken };
}

async function main() {
  if (!BASE) {
    console.error('SMOKE_API is required - point it at a LOCAL test API, e.g. http://localhost:5100/api');
    process.exit(1);
  }
  if (!isLocalApi(BASE)) {
    console.error('SMOKE_API host must be local for this suite; refusing the HTTP target');
    process.exit(1);
  }
  if (!isLocalDatabase(env.MONGODB_URI)) {
    console.error('MONGODB_URI must be a local database for this suite; refusing to run');
    process.exit(1);
  }

  await mongoose.connect(env.MONGODB_URI, { dbName: env.MONGODB_DB, serverSelectionTimeoutMS: 10_000 });

  try {
    await run();
  } finally {
    await mongoose.disconnect();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

async function run() {
  section('Environment');
  const session = await register('main');
  // Proves the API we are calling writes to the database we are inspecting:
  // a misaligned target fails here, before any lifecycle claim is trusted.
  const issuedRow = await RefreshSession.findById((jwt.decode(session.cookie) as { jti: string }).jti);
  check('API and suite share the same database', issuedRow !== null, { found: issuedRow !== null });

  section('Configuration-driven TTLs');
  const accessSpan = tokenSpan(session.accessToken);
  const refreshSpan = tokenSpan(session.cookie);
  check(
    `access token lifetime follows JWT_EXPIRES_IN (${env.JWT_EXPIRES_IN})`,
    accessSpan !== null && Math.abs(accessSpan - durationMs(env.JWT_EXPIRES_IN)) <= 5_000,
    { span: accessSpan },
  );
  check(
    `refresh token lifetime follows JWT_REFRESH_EXPIRES_IN (${env.JWT_REFRESH_EXPIRES_IN})`,
    refreshSpan !== null && Math.abs(refreshSpan - durationMs(env.JWT_REFRESH_EXPIRES_IN)) <= 5_000,
    { span: refreshSpan },
  );
  const login = await call('/auth/login', {
    method: 'POST',
    body: { email: session.email, password: TEST_PASSWORD },
  });
  const maxAgeLine = setCookieHeader(login);
  const maxAge = Number(/Max-Age=(\d+)/.exec(maxAgeLine ?? '')?.[1]);
  check(
    'refresh cookie Max-Age equals the refresh TTL',
    login.status === 200 && Number.isFinite(maxAge) && Math.abs(maxAge * 1000 - durationMs(env.JWT_REFRESH_EXPIRES_IN)) <= 5_000,
    { status: login.status, maxAge },
  );

  section('Rotation invalidates the presented token');
  const before = jwt.decode(session.cookie) as { jti: string; fid: string };
  const rotated = await call('/auth/refresh', { method: 'POST', cookie: session.cookie });
  const rotatedCookie = refreshCookieOf(rotated);
  check('refresh with a valid cookie succeeds', rotated.status === 200 && typeof rotated.body?.data?.accessToken === 'string', {
    status: rotated.status,
  });
  check('rotation issues a different refresh token', Boolean(rotatedCookie) && rotatedCookie !== session.cookie);
  const beforeRow = await RefreshSession.findById(before.jti);
  check("the presented token's row is marked used", beforeRow?.usedAt instanceof Date, { used: beforeRow?.usedAt != null });
  const after = jwt.decode(rotatedCookie ?? '') as { jti: string; fid: string };
  const afterRow = rotatedCookie ? await RefreshSession.findById(after.jti) : null;
  check('the rotated token lands in the same session family', afterRow?.familyId === before.fid, {
    sameFamily: afterRow?.familyId === before.fid,
  });
  const stale = await call('/auth/refresh', { method: 'POST', cookie: session.cookie });
  check('the previous token is rejected after rotation', stale.status === 401, { status: stale.status });
  const chained = await call('/auth/refresh', { method: 'POST', cookie: rotatedCookie! });
  check('the newest token keeps the chain alive', chained.status === 200, { status: chained.status });

  section('Concurrent refresh (10 parallel, one cookie)');
  const concurrent = await register('race');
  const burst = await Promise.all(
    Array.from({ length: 10 }, () => call('/auth/refresh', { method: 'POST', cookie: concurrent.cookie })),
  );
  const winners = burst.filter((r) => r.status === 200);
  const losers = burst.filter((r) => r.status !== 200);
  check('exactly one concurrent refresh succeeds', winners.length === 1, { winners: winners.length });
  check('the other nine are rejected with 401', losers.length === 9 && losers.every((r) => r.status === 401), {
    statuses: losers.map((r) => r.status),
  });
  const winnerCookie = winners.length === 1 ? refreshCookieOf(winners[0]) : undefined;
  const afterBurst = winnerCookie ? await call('/auth/refresh', { method: 'POST', cookie: winnerCookie }) : undefined;
  check("the winner's cookie continues the session", afterBurst?.status === 200, { status: afterBurst?.status });
  const replayOriginal = await call('/auth/refresh', { method: 'POST', cookie: concurrent.cookie });
  check('the original cookie stays rejected after the burst', replayOriginal.status === 401, { status: replayOriginal.status });

  section('Replay of a rotated token mints nothing');
  const replay = await call('/auth/refresh', { method: 'POST', cookie: rotatedCookie! });
  check('reusing a rotated token is rejected', replay.status === 401, { status: replay.status });
  check('the rejection sets no refresh cookie', setCookieHeader(replay) === undefined);
  check('the rejection carries no access token', replay.body?.data?.accessToken === undefined, {
    hasAccessToken: replay.body?.data?.accessToken !== undefined,
  });

  section('Forged and pre-E1 refresh tokens');
  const legacy = jwt.sign(
    { sub: session.userId, email: session.email, role: 'user', tokenType: 'refresh' },
    env.JWT_REFRESH_SECRET,
    { algorithm: 'HS256', expiresIn: '10m' },
  );
  const legacyRes = await call('/auth/refresh', { method: 'POST', cookie: legacy });
  check('a pre-E1 refresh token (no session claims) is rejected', legacyRes.status === 401, { status: legacyRes.status });
  const accessTyped = jwt.sign(
    { sub: session.userId, email: session.email, role: 'user', tokenType: 'access', jti: randomUUID(), fid: randomUUID() },
    env.JWT_REFRESH_SECRET,
    { algorithm: 'HS256', expiresIn: '10m' },
  );
  const accessTypedRes = await call('/auth/refresh', { method: 'POST', cookie: accessTyped });
  check('an access-typed token cannot be used to refresh', accessTypedRes.status === 401, { status: accessTypedRes.status });
  const wrongSecret = jwt.sign(
    { sub: session.userId, email: session.email, role: 'user', tokenType: 'refresh', jti: randomUUID(), fid: randomUUID() },
    env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '10m' },
  );
  const wrongSecretRes = await call('/auth/refresh', { method: 'POST', cookie: wrongSecret });
  check('a refresh token signed with the access secret is rejected', wrongSecretRes.status === 401, {
    status: wrongSecretRes.status,
  });

  section('Logout revokes the session');
  const logoutA = await register('logout');
  const relogin = await call('/auth/login', {
    method: 'POST',
    body: { email: logoutA.email, password: TEST_PASSWORD },
  });
  const logoutBCookie = refreshCookieOf(relogin);
  const loggedOut = await call('/auth/logout', { method: 'POST', body: {}, cookie: logoutA.cookie });
  check('logout answers 200 with loggedOut: true', loggedOut.status === 200 && loggedOut.body?.data?.loggedOut === true, {
    status: loggedOut.status,
  });

  /**
   * Deletion has to match the policy that set the cookie.
   *
   * A browser removes a cookie by name, domain and path, and it only honors the
   * `SameSite`/`Secure` pair it stored the cookie under. A clear that drifts from
   * the setting policy leaves the old refresh token alive in the jar after logout,
   * so the attributes below are compared against the same policy the login response
   * was built from - here, the lines captured live on this very run.
   */
  const setLine = setCookieHeader(relogin);
  const clearLine = setCookieHeader(loggedOut, REFRESH_COOKIE) ?? '';
  const clearingMatches = Boolean(setLine) && Boolean(clearLine);
  for (const attr of ['SameSite', 'Secure', 'HttpOnly', 'Path'] as const) {
    check(
      `logout's cookie removal carries the same ${attr} as the cookie it sets`,
      clearingMatches && cookieAttr(clearLine, attr) === cookieAttr(setLine ?? '', attr),
      { set: cookieAttr(setLine ?? '', attr) ?? '(absent)', cleared: cookieAttr(clearLine, attr) ?? '(absent)' },
    );
  }
  const clearedValue = clearLine.split(';')[0]?.split('=')[1] ?? 'x';
  const expiresImmediately =
    cookieAttr(clearLine, 'Max-Age') === '0' ||
    (() => {
      const raw = cookieAttr(clearLine, 'Expires');
      const at = raw ? Date.parse(raw) : Number.NaN;
      return Number.isFinite(at) && at <= Date.now() + 60_000;
    })();
  check('logout empties the cookie value', clearLine.startsWith(`${REFRESH_COOKIE}=`) && clearedValue === '', {
    empty: clearedValue === '',
  });
  check('logout expires the cookie immediately', expiresImmediately, {
    maxAge: cookieAttr(clearLine, 'Max-Age') ?? '(absent)',
    expires: cookieAttr(clearLine, 'Expires') ?? '(absent)',
  });

  const afterLogout = await call('/auth/refresh', { method: 'POST', cookie: logoutA.cookie });
  check('refresh after logout is rejected', afterLogout.status === 401, { status: afterLogout.status });
  const familyId = (jwt.decode(logoutA.cookie) as { fid: string }).fid;
  const familyRows = await RefreshSession.find({ familyId });
  check(
    'every row of the logged-out family carries revokedAt',
    familyRows.length > 0 && familyRows.every((row) => row.revokedAt instanceof Date),
    { rows: familyRows.length, revoked: familyRows.filter((row) => row.revokedAt).length },
  );
  const sibling = logoutBCookie
    ? await call('/auth/refresh', { method: 'POST', cookie: logoutBCookie })
    : ({ status: 0 } as HttpResult);
  check('a second session of the same account survives the logout', sibling.status === 200, { status: sibling.status });
  const anonymousLogout = await call('/auth/logout', { method: 'POST', body: {} });
  check(
    'logout without a token still answers loggedOut: true (contract)',
    anonymousLogout.status === 200 && anonymousLogout.body?.data?.loggedOut === true,
    { status: anonymousLogout.status },
  );

  section('Expiration');
  const expiredAccess = jwt.sign(
    { sub: session.userId, email: session.email, role: 'user', tokenType: 'access' },
    env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '-10s' },
  );
  const expiredAccessRes = await call('/auth/me', { token: expiredAccess });
  check('an expired access token cannot call /auth/me', expiredAccessRes.status === 401, { status: expiredAccessRes.status });

  const ghostJti = randomUUID();
  const ghostFid = randomUUID();
  const expiredRefresh = jwt.sign(
    { sub: session.userId, email: session.email, role: 'user', tokenType: 'refresh', jti: ghostJti, fid: ghostFid },
    env.JWT_REFRESH_SECRET,
    { algorithm: 'HS256', expiresIn: '-10s' },
  );
  await RefreshSession.create({
    _id: ghostJti,
    familyId: ghostFid,
    user: session.userId,
    expiresAt: new Date(Date.now() + 60_000),
  });
  try {
    const expiredRefreshRes = await call('/auth/refresh', { method: 'POST', cookie: expiredRefresh });
    check('an expired refresh token is rejected even with a live session row', expiredRefreshRes.status === 401, {
      status: expiredRefreshRes.status,
    });
    const ghostRow = await RefreshSession.findById(ghostJti);
    check('the rejection happens before the row is claimed', ghostRow?.usedAt == null, { used: ghostRow?.usedAt != null });
  } finally {
    await RefreshSession.deleteOne({ _id: ghostJti });
  }

  section('Access token surfaces are Bearer-only');
  const meBearer = await call('/auth/me', { token: session.accessToken });
  check(
    'a protected API answers a valid Bearer token',
    meBearer.status === 200 && meBearer.body?.data?.id === session.userId,
    { status: meBearer.status },
  );
  const meAnonymous = await call('/auth/me');
  check('the same API rejects a request without a token', meAnonymous.status === 401, { status: meAnonymous.status });
  const meViaCookie = await call('/auth/me', { cookies: { accessToken: session.accessToken } });
  check('an access token sent via cookie is refused (Bearer-only contract)', meViaCookie.status === 401, {
    status: meViaCookie.status,
  });
  const loginHygiene = await call('/auth/login', {
    method: 'POST',
    body: { email: session.email, password: TEST_PASSWORD },
  });
  const hygieneLine = setCookieHeader(loginHygiene) ?? '';
  check('the refresh cookie is HttpOnly', /HttpOnly/i.test(hygieneLine));
  check('the refresh cookie is scoped to Path=/', /Path=\//.test(hygieneLine));
  check('login never returns the refresh token in the body', loginHygiene.body?.data?.refreshToken === undefined);
  const rotatedHygiene = await call('/auth/refresh', { method: 'POST', cookie: refreshCookieOf(loginHygiene)! });
  check('refresh never returns the refresh token in the body', rotatedHygiene.body?.data?.refreshToken === undefined);
  check('refresh rotates the cookie on every call', Boolean(refreshCookieOf(rotatedHygiene)));

  section('Cookie transport - the attributes a browser decides on');
  /**
   * Transport policy, asserted on the real Set-Cookie lines.
   *
   * This is the part that broke a Netlify storefront against a Render API: the
   * cookie was created, valid and stored, but `SameSite=Lax` kept the browser from
   * ever attaching it to the cross-site refresh request, so `/auth/refresh` answered
   * 401 "No refresh token supplied" while `/auth/login` and `/auth/me` were fine.
   * `npm run cookie:policy-tests` covers the rules themselves; this proves the API
   * emits them on the wire. Both read the same .env as the API under test, so a
   * mismatch here means the API was started with a different configuration.
   */
  const expected = resolveCookiePolicy({
    samesite: env.COOKIE_SAMESITE,
    secure: env.COOKIE_SECURE,
    isProd: env.isProd,
  });
  const sameSite = cookieAttr(hygieneLine, 'SameSite') ?? '';
  check(
    `the refresh cookie carries the configured SameSite (${expected.sameSite})`,
    sameSite.toLowerCase() === expected.sameSite.toLowerCase(),
    { observed: sameSite || '(none)', expected: expected.sameSite },
  );
  check(
    `Secure follows the policy (expected ${expected.secure ? 'on' : 'off'})`,
    (cookieAttr(hygieneLine, 'Secure') === 'flag') === expected.secure,
    { secure: cookieAttr(hygieneLine, 'Secure') ?? '(absent)' },
  );
  check('no cookie is widened to a Domain attribute', cookieAttr(hygieneLine, 'Domain') === undefined, {
    domain: cookieAttr(hygieneLine, 'Domain') ?? '(absent)',
  });
  check('SameSite=None is never sent without Secure', !(sameSite.toLowerCase() === 'none' && cookieAttr(hygieneLine, 'Secure') !== 'flag'));

  const noCredential = await call('/auth/refresh', { method: 'POST', body: {} });
  const noCredentialMessage = noCredential.body?.message ?? noCredential.body?.error?.message ?? '';
  check(
    'a refresh with no cookie and no body is refused, not served',
    noCredential.status === 401 && /no refresh token supplied/i.test(noCredentialMessage),
    { status: noCredential.status, message: noCredentialMessage },
  );
  check('that refusal sets no cookie', setCookieHeader(noCredential) === undefined);

  section('CORS credentials - the other half of a cross-site session');
  /**
   * A refresh cookie only arrives if the browser is also allowed to send it.
   *
   * `Access-Control-Allow-Credentials: true` is what lets a cross-site fetch carry
   * cookies at all, and it is refused outright when the allow-origin is the wildcard.
   * Both halves are asserted on responses this API actually produced, for the exact
   * origin in its own allowlist plus one origin that is not in it.
   */
  const allowedOrigin = env.corsOrigins[0];
  if (!allowedOrigin) {
    console.log('  SKIP  CORS_ORIGINS is empty; nothing to probe - set it to the storefront origin');
  } else {
    const options = await preflight('/auth/refresh', allowedOrigin);
    check(
      `a preflight from the allowlisted origin is accepted (HTTP ${options.status})`,
      options.status >= 200 && options.status < 300,
      { status: options.status },
    );
    check(
      'the preflight echoes that origin back exactly, never a wildcard',
      options.headers['access-control-allow-origin'] === allowedOrigin,
      { acao: options.headers['access-control-allow-origin'] ?? '(absent)' },
    );
    check(
      'the preflight grants credentials',
      options.headers['access-control-allow-credentials'] === 'true',
      { acac: options.headers['access-control-allow-credentials'] ?? '(absent)' },
    );
    const corsPost = await call('/auth/refresh', { method: 'POST', body: {}, origin: allowedOrigin });
    check(
      'the actual request answers with the same origin + credentials pair',
      corsPost.headers['access-control-allow-origin'] === allowedOrigin &&
        corsPost.headers['access-control-allow-credentials'] === 'true',
      {
        status: corsPost.status,
        acao: corsPost.headers['access-control-allow-origin'] ?? '(absent)',
        acac: corsPost.headers['access-control-allow-credentials'] ?? '(absent)',
      },
    );
    check('a credentialed response never uses a wildcard origin', corsPost.headers['access-control-allow-origin'] !== '*');

    const hostile = await call('/auth/refresh', { method: 'POST', body: {}, origin: 'https://evil.example' });
    check('an origin outside the allowlist is refused', hostile.status === 403, { status: hostile.status });
    check(
      'a refused origin is never echoed back as allowed',
      hostile.headers['access-control-allow-origin'] === undefined,
      { acao: hostile.headers['access-control-allow-origin'] ?? '(absent)' },
    );
    check('a refused origin sets no cookie either', hostile.setCookies.length === 0, {
      cookies: hostile.setCookies.length,
    });
  }

  section('Guest session and cart merge on login');
  const product = await Product.create({
    sku: `E1-${runId}-cart`,
    slug: `e1-refresh-cart-${runId}`,
    name: { hy: 'E1 ապրանք', en: 'E1 item', ru: 'E1 товар' },
    category: new Types.ObjectId(),
    price: 1000,
    deliveryMethods: ['quick'],
    stock: 10,
    trackStock: true,
    isActive: true,
  });

  const guestAdd = await call('/cart/items', {
    method: 'POST',
    body: { productId: String(product._id), quantity: 2, deliveryMethod: 'quick' },
  });
  const sid = cookieOf(guestAdd, GUEST_COOKIE);
  check('an anonymous cart write succeeds and mints a guest session', guestAdd.status === 201 && Boolean(sid), {
    status: guestAdd.status,
    minted: Boolean(sid),
  });
  const sidLine = setCookieHeader(guestAdd, GUEST_COOKIE) ?? '';
  check('the guest cookie is HttpOnly', /HttpOnly/i.test(sidLine));
  check(
    'the guest cookie carries the same transport policy as the session cookie',
    (cookieAttr(sidLine, 'SameSite') ?? '').toLowerCase() === expected.sameSite &&
      (cookieAttr(sidLine, 'Secure') === 'flag') === expected.secure &&
      cookieAttr(sidLine, 'Domain') === undefined,
    { sameSite: cookieAttr(sidLine, 'SameSite') ?? '(absent)', secure: cookieAttr(sidLine, 'Secure') ?? '(absent)' },
  );
  check('a guest request never touches the refresh cookie', setCookieHeader(guestAdd, REFRESH_COOKIE) === undefined);
  const guestView = await call('/cart', { cookies: { [GUEST_COOKIE]: sid! } });
  check('the guest cart persists across requests', guestView.status === 200 && guestView.body?.data?.itemCount === 1, {
    status: guestView.status,
    itemCount: guestView.body?.data?.itemCount,
  });

  const merged = await register('merge', { [GUEST_COOKIE]: sid! });
  const mergedView = await call('/cart', { token: merged.accessToken });
  check(
    'registering with a guest cookie merges the cart into the member cart',
    mergedView.body?.data?.itemCount === 1,
    { itemCount: mergedView.body?.data?.itemCount },
  );
  const guestAfter = await call('/cart', { cookies: { [GUEST_COOKIE]: sid! } });
  check('the guest cart is emptied by the merge', guestAfter.body?.data?.itemCount === 0, {
    itemCount: guestAfter.body?.data?.itemCount,
  });

  section('Admin endpoints stay server-gated');
  const adminAnonymous = await call('/admin/stats');
  check('admin API rejects an anonymous request', adminAnonymous.status === 401, { status: adminAnonymous.status });
  const adminAsUser = await call('/admin/stats', { token: session.accessToken });
  check('admin API rejects a regular member token', adminAsUser.status === 403, { status: adminAsUser.status });
  await User.updateOne({ _id: session.userId }, { $set: { role: 'admin' } });
  const adminRelogin = await call('/auth/login', {
    method: 'POST',
    body: { email: session.email, password: TEST_PASSWORD },
  });
  const adminOk = await call('/admin/stats', { token: adminRelogin.body?.data?.accessToken });
  check('admin API accepts an admin token after the role change', adminOk.status === 200, {
    status: adminOk.status,
    reloginStatus: adminRelogin.status,
  });
  await User.updateOne({ _id: session.userId }, { $set: { role: 'user' } });
}

main().catch((err) => {
  console.error(`environment failure: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
