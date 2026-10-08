/* eslint-disable no-console */
/**
 * Cookie transport regression suite.
 *
 * The bug this was written for: a storefront served from a different registrable
 * domain than the API (Netlify -> Render here) cannot send a `SameSite=Lax`
 * cookie on a cross-site XHR. The login itself answers 200 and sets the cookie,
 * `/auth/me` keeps answering on the in-memory Bearer token, and the first refresh
 * after the access token expires returns 401 "No refresh token supplied" - a
 * session that quietly stops being refreshable.
 *
 * These tests pin the rules that fix decides, without needing a browser:
 * the policy is configuration-driven, `SameSite=None` can never be issued without
 * `Secure`, `httpOnly`/`Path=/` are not configurable at all, no cookie ever gets a
 * `Domain` attribute (host-only, which is also what makes a proxied deployment
 * work), and the contradictory pairs are refused at boot.
 *
 * Nothing here weakens token validation: this file is about how an already-valid
 * token is allowed to travel.
 *
 *   npm run cookie:policy-tests
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cookiePolicy, GUEST_COOKIE, REFRESH_COOKIE, resolveCookiePolicy } from '../config/cookiePolicy';
import { cookiePolicyConflicts, env } from '../config/env';

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

const SAMESITES = ['lax', 'strict', 'none'] as const;
const SECURES = ['auto', 'true', 'false'] as const;
const ENVS = [true, false] as const;

/** Attributes no deployment may ever change, whatever the configuration says. */
function runInvariants() {
  section('Invariants - the parts no configuration can move');
  let allHttpOnly = true;
  let allPathRoot = true;
  let neverDomain = true;
  let noneAlwaysSecure = true;

  for (const isProd of ENVS) {
    for (const samesite of SAMESITES) {
      for (const secure of SECURES) {
        const policy = resolveCookiePolicy({ samesite, secure, isProd });
        if (policy.httpOnly !== true) allHttpOnly = false;
        if (policy.path !== '/') allPathRoot = false;
        if ('domain' in policy) neverDomain = false;
        if (policy.sameSite === 'none' && policy.secure !== true) noneAlwaysSecure = false;
      }
    }
  }

  check('every cookie is HttpOnly (a token readable by JS is a stolen session)', allHttpOnly);
  check('every cookie is scoped to Path=/', allPathRoot);
  check('no cookie is ever widened to a Domain - host-only, never *.onrender.com', neverDomain);
  check('SameSite=None is never issued without Secure, in any configuration', noneAlwaysSecure);
  check('the refresh cookie and the guest cookie are the two names this policy covers',
    REFRESH_COOKIE === 'xf_refresh' && GUEST_COOKIE === 'xf_sid');
}

function runDevelopmentDefaults() {
  section('Development defaults - http://localhost must keep working');
  const policy = resolveCookiePolicy({ samesite: 'lax', secure: 'auto', isProd: false });
  check('dev + auto: not Secure, so a plain http:// storefront still gets a cookie', policy.secure === false, policy);
  check('dev + auto: SameSite stays lax', policy.sameSite === 'lax');

  const explicitInsecure = resolveCookiePolicy({ samesite: 'lax', secure: 'false', isProd: false });
  check('COOKIE_SECURE=false is honoured outside production (laptop testing)', explicitInsecure.secure === false);
  const explicitSecure = resolveCookiePolicy({ samesite: 'lax', secure: 'true', isProd: false });
  check('COOKIE_SECURE=true is honoured outside production (local https)', explicitSecure.secure === true);
}

function runProductionDefaults() {
  section('Production defaults - the deployment that ships');
  const policy = resolveCookiePolicy({ samesite: 'lax', secure: 'auto', isProd: true });
  check('production + auto: Secure is on without being asked for', policy.secure === true, policy);
  check('production + auto: lax is still the default, so a same-site shop is unchanged', policy.sameSite === 'lax');

  const crossSite = resolveCookiePolicy({ samesite: 'none', secure: 'auto', isProd: true });
  check('COOKIE_SAMESITE=none issues the cross-site cookie a Netlify -> Render browser can send',
    crossSite.sameSite === 'none' && crossSite.secure === true, crossSite);
  check('COOKIE_SAMESITE=none forces Secure even when COOKIE_SECURE says otherwise',
    resolveCookiePolicy({ samesite: 'none', secure: 'false', isProd: true }).secure === true);

  const strict = resolveCookiePolicy({ samesite: 'strict', secure: 'auto', isProd: true });
  check('COOKIE_SAMESITE=strict is passed through unchanged', strict.sameSite === 'strict' && strict.secure === true);
}

function runBootRefusals() {
  section('Boot refusals - contradictory cookie configuration fails loudly');
  const conflicts = (NODE_ENV: string, COOKIE_SAMESITE: string, COOKIE_SECURE: string) =>
    cookiePolicyConflicts({ NODE_ENV, COOKIE_SAMESITE: COOKIE_SAMESITE as never, COOKIE_SECURE: COOKIE_SECURE as never });

  const noneInsecure = conflicts('development', 'none', 'false');
  check('none + COOKIE_SECURE=false is refused (the cookie would never be stored)',
    noneInsecure.length === 1 && noneInsecure[0].path === 'COOKIE_SECURE', noneInsecure);
  check('the refusal names the variable, never a value',
    noneInsecure.every((i) => !/(=|:\s)\S*(secret|token)/i.test(i.message)));

  check('production + COOKIE_SECURE=false is refused (cookies over plain HTTP)',
    conflicts('production', 'lax', 'false').some((i) => /production/i.test(i.message)));
  check('production + none + COOKIE_SECURE=false reports both problems',
    conflicts('production', 'none', 'false').length === 2);

  check('production + auto is accepted', conflicts('production', 'lax', 'auto').length === 0);
  check('production + true is accepted', conflicts('production', 'none', 'true').length === 0);
  check('development + lax + false is accepted (that is how local http works)',
    conflicts('development', 'lax', 'false').length === 0);
  check('development + none + auto is accepted - forcing Secure is enough, no contradiction',
    conflicts('development', 'none', 'auto').length === 0);
}

function runLivePolicy() {
  section('The policy this process actually runs');
  const live = cookiePolicy();
  const expected = resolveCookiePolicy({
    samesite: env.COOKIE_SAMESITE,
    secure: env.COOKIE_SECURE,
    isProd: env.isProd,
  });
  check('cookiePolicy() is exactly the configured policy - no hidden override',
    JSON.stringify(live) === JSON.stringify(expected), { live, expected });
  check('the running configuration is internally consistent',
    live.sameSite !== 'none' || live.secure === true, live);
  check('httpOnly is on for the real cookies', live.httpOnly === true);
}

function runShippedDefaults() {
  section('.env.example documents the same defaults the code uses');
  const example = readFileSync(path.resolve(process.cwd(), '.env.example'), 'utf8');
  const samesite = /^COOKIE_SAMESITE=(\S+)/m.exec(example)?.[1];
  const secure = /^COOKIE_SECURE=(\S+)/m.exec(example)?.[1];
  check('.env.example ships COOKIE_SAMESITE=lax (same-site behaviour is the default)', samesite === 'lax', { samesite });
  check('.env.example ships COOKIE_SECURE=auto (Secure follows NODE_ENV)', secure === 'auto', { secure });
  check('.env.example documents none as the cross-site value', /none/.test(example));
}

function main() {
  runInvariants();
  runDevelopmentDefaults();
  runProductionDefaults();
  runBootRefusals();
  runLivePolicy();
  runShippedDefaults();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
