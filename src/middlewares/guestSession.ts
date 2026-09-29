import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { randomToken } from '../utils/codes';

export const GUEST_COOKIE = 'xf_sid';

/**
 * Guest carts key off a signed-free random id kept in a long-lived cookie, so a
 * visitor can build a basket before deciding to register.
 */
export function guestSession(req: Request, res: Response, next: NextFunction) {
  const cookies = (req as unknown as { cookies?: Record<string, string> }).cookies ?? {};
  let sid = cookies[GUEST_COOKIE] || (req.headers['x-session-id'] as string | undefined);

  if (!sid) {
    sid = randomToken(16);
    res.cookie(GUEST_COOKIE, sid, {
      httpOnly: true,
      secure: env.isProd,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 30,
      path: '/',
    });
  }

  (req as Request & { sessionId: string }).sessionId = sid;
  next();
}
