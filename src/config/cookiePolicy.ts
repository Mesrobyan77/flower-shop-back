import type { CookieOptions } from 'express';
import { env } from './env';

/**
 * The two cookies the API writes, named here so a policy change and a test can
 * never disagree about which cookie they are talking about.
 *
 * `xf_refresh` carries the session's refresh token; `xf_sid` identifies a guest
 * basket before anyone has an account.
 */
export const REFRESH_COOKIE = 'xf_refresh';
export const GUEST_COOKIE = 'xf_sid';

/**
 * The single place the API decides how its own cookies travel.
 *
 * Both cookies the shop writes (`xf_refresh` for sessions, `xf_sid` for guest
 * baskets) are bearer credentials: whoever holds them can mint access tokens or
 * empty a cart. They must therefore keep the same policy, and a deployment that
 * changes one of them by hand is one copy-paste away from sending a session
 * cookie over plain HTTP or storing it where any script can read it.
 */
export type CookieSameSite = 'lax' | 'strict' | 'none';

/**
 * A cookie policy with the parts that are never optional spelled out: Express
 * types `sameSite` as possibly boolean and `path` as possibly absent, and a
 * cookie call site that has to re-check those is a call site that can silently
 * forget one.
 */
export interface ApiCookiePolicy extends CookieOptions {
  httpOnly: true;
  path: '/';
  sameSite: CookieSameSite;
  secure: boolean;
}

/**
 * Resolve a cookie policy from configuration, with no Express or process state
 * involved so the rules below are testable on their own.
 *
 * The rules, in order of who overrides whom:
 *
 * - `httpOnly` is not configurable. A refresh token readable by JavaScript is an
 *   XSS away from being a stolen session; the storefront never needs to read it,
 *   the browser attaches it.
 * - `Path=/` is not configurable either: the cookie has to reach `/api/auth/*`
 *   and `/api/cart*`, and a narrower path would silently break one of them.
 * - `secure` follows `COOKIE_SECURE` (`auto` means "only in production"), except
 *   when `SameSite=None` - browsers refuse to *store* a `None` cookie without
 *   `Secure`, so an insecure `None` is not a weaker setting, it is a cookie that
 *   quietly never exists. `None` therefore forces `Secure` regardless of any
 *   other input; the pair `COOKIE_SAMESITE=none` + `COOKIE_SECURE=false` is also
 *   refused at boot, as is `COOKIE_SECURE=false` in production (see
 *   `cookiePolicyConflicts` in `config/env.ts`).
 *
 * @param input.samesite  `COOKIE_SAMESITE`
 * @param input.secure    `COOKIE_SECURE`; `auto` derives from `isProd`
 * @param input.isProd    `NODE_ENV === 'production'`
 */
export function resolveCookiePolicy(input: {
  samesite: CookieSameSite;
  secure: 'auto' | 'true' | 'false';
  isProd: boolean;
}): ApiCookiePolicy {
  const explicit = input.secure === 'true' ? true : input.secure === 'false' ? false : input.isProd;
  return {
    httpOnly: true,
    path: '/',
    sameSite: input.samesite,
    secure: input.samesite === 'none' ? true : explicit,
  };
}

/**
 * The policy for this process, read from the environment exactly once per call
 * site. `COOKIE_SAMESITE` defaults to `lax`, which is what a same-site
 * storefront wants: a cookie that never leaves for another site is a cookie an
 * attacker's page cannot borrow.
 *
 * `None` exists for one shape of deployment only - a storefront on a different
 * registrable domain than the API, whose browser then has to attach the cookie to
 * a cross-site XHR. That is a deliberate trade: cross-site cookies are the class
 * browsers are tightening third-party storage rules around, so the same-site
 * alternative (serve the API through the storefront's own origin) stays the
 * durable option. Nothing here weakens the token itself.
 */
export function cookiePolicy(): ApiCookiePolicy {
  return resolveCookiePolicy({
    samesite: env.COOKIE_SAMESITE,
    secure: env.COOKIE_SECURE,
    isProd: env.isProd,
  });
}
