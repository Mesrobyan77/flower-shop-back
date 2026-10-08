import type { NextFunction, Request, Response } from 'express';
import { cookiePolicy, GUEST_COOKIE } from '../config/cookiePolicy';
import { randomToken } from '../utils/codes';

/** Re-exported for the call sites that already import the name from here. */
export { GUEST_COOKIE };

/**
 * Guest basket keys are opaque identifiers that end up in a unique index, in log
 * lines and in the storefront's HTML. A caller-supplied value is therefore only
 * honoured when it looks like something we would have minted: bounded length, no
 * whitespace, no punctuation that could smuggle markup or break a log line. Anything
 * else is replaced by a fresh id rather than echoed back.
 */
const SESSION_ID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Guest carts key off a signed-free random id kept in a long-lived cookie, so a
 * visitor can build a basket before deciding to register.
 */
export function guestSession(req: Request, res: Response, next: NextFunction) {
  const cookies = (req as unknown as { cookies?: Record<string, string> }).cookies ?? {};
  const supplied = cookies[GUEST_COOKIE] ?? (req.headers['x-session-id'] as string | undefined);
  let sid = supplied && SESSION_ID.test(supplied) ? supplied : undefined;

  if (!sid) {
    sid = randomToken(16);
    res.cookie(GUEST_COOKIE, sid, {
      ...cookiePolicy(),
      maxAge: 1000 * 60 * 60 * 24 * 30,
    });
  }

  (req as Request & { sessionId: string }).sessionId = sid;
  next();
}
