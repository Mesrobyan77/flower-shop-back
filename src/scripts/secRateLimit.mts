/* eslint-disable no-console */
/**
 * Rate-limit bypass re-test. Run against a stack whose limiters are ARMED
 * (NODE_ENV=development), e.g. the in-memory API on :5060.
 *
 *   MODE=r1 npx tsx src/scripts/secRateLimit.mts   # X-Forwarded-For rotation
 *   MODE=r2 npx tsx src/scripts/secRateLimit.mts   # per-credential cap
 *
 * The buckets live in process memory, so the stack has to be restarted between
 * modes; otherwise the earlier probe's IP-level hits dominate the evidence.
 *
 * No secrets are printed and no real account is touched.
 */
import crypto from 'crypto';

const BASE = process.env.SMOKE_API ?? 'http://localhost:5060/api';
const MODE = process.env.MODE ?? 'r1';
const PW = 'AuditPass1!x';
const RUN = Date.now();

/** authLimiter allows 20 attempts per IP per 15 minutes; credentialsLimiter 10. */
const AUTH_IP_LIMIT = 20;
const CREDENTIAL_LIMIT = 10;

async function attempt(path: string, body: unknown, ip: string) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let code = '';
  try {
    code = String(JSON.parse(text)?.code ?? '');
  } catch {
    /* ignore */
  }
  return { status: res.status, code };
}

const randomIp = () => `203.0.113.${crypto.randomInt(1, 250)}`;

function verdict(id: string, sev: string, title: string, exploited: boolean, evidence: string) {
  console.log(`${exploited ? 'EXPLOITED' : 'BLOCKED'} [${id}] (${sev}) ${title} :: ${evidence}`.slice(0, 900));
}

async function r1() {
  /* the original exploit: one fresh bucket per forged header value.
     Every attempt uses a different address so only the IP bucket can stop it. */
  const statuses: number[] = [];
  for (let i = 0; i < 30; i += 1) {
    const r = await attempt('/auth/login', { email: `r1.${RUN}.${i}@example.test`, password: `${PW}-wrong-${i}` }, randomIp());
    statuses.push(r.status);
  }
  const first429 = statuses.indexOf(429);
  verdict('R-1', 'HIGH', 'rotating X-Forwarded-For escapes the auth rate limit',
    first429 === -1 || first429 + 1 > AUTH_IP_LIMIT + 1,
    `30 logins, 30 distinct addresses, each from a different forged client IP -> first 429 at attempt ${first429 === -1 ? 'never' : first429 + 1} (expected at ${AUTH_IP_LIMIT + 1}, the IP bucket), 429 count ${statuses.filter((s) => s === 429).length}`);
}

async function r2() {
  /* credential cap: one address, and a source IP that genuinely varies */
  const targetEmail = `r2.${RUN}@example.test`;
  const credStatuses: number[] = [];
  for (let i = 0; i < AUTH_IP_LIMIT - 2; i += 1) {
    const r = await attempt('/auth/login', { email: targetEmail, password: `${PW}-wrong-${i}` }, randomIp());
    credStatuses.push(r.status);
  }
  const credFirst429 = credStatuses.indexOf(429);
  verdict('R-2', 'MEDIUM', 'a password spray spreads across source IPs to dodge the per-account limit',
    credFirst429 === -1 || credFirst429 + 1 > CREDENTIAL_LIMIT + 2,
    `${credStatuses.length} attempts on one address from ${credStatuses.length} different forged IPs (all below the ${AUTH_IP_LIMIT}-attempt IP bucket) -> first 429 at attempt ${credFirst429 === -1 ? 'never' : credFirst429 + 1} (the per-credential bucket holds ${CREDENTIAL_LIMIT}), statuses ${credStatuses.join(',')}`);
}

async function r3() {
  /* R-3 - registration must be bounded by the same credential limiter */
  const duplicateEmail = `r3.${RUN}@example.test`;
  const regStatuses: number[] = [];
  for (let i = 0; i < CREDENTIAL_LIMIT + 2; i += 1) {
    const r = await attempt('/auth/register', {
      email: duplicateEmail,
      password: PW,
      name: 'Spray Bot',
      agreeTerms: true,
    }, randomIp());
    regStatuses.push(r.status);
  }
  const regFirst429 = regStatuses.indexOf(429);
  verdict('R-3', 'MEDIUM', 'account creation can be repeated for one address without a credential cap',
    regFirst429 === -1,
    `${regStatuses.length} registrations for one address -> first 429 at attempt ${regFirst429 === -1 ? 'never' : regFirst429 + 1}, statuses ${regStatuses.join(',')}`);
}

async function run() {
  console.log(`\n=== RATE LIMITS ${MODE.toUpperCase()}  ${BASE} ===`);
  if (MODE === 'r1') return r1();
  if (MODE === 'r2') return r2();
  return r3();
}

run().catch((e) => {
  console.error('harness error:', (e as Error).message);
  process.exit(1);
});
