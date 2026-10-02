import type { NextFunction, Request, Response } from 'express';
import { mergeGuestCart } from '../services/auth.service';
import type { AuthedRequest } from '../types';

/**
 * Absorbs a guest basket into the member's basket whenever a request carries
 * BOTH identities: a verified Bearer user and the guest session cookie.
 *
 * Login/register merge only at the moment of signing in, but items can also be
 * added while the access token is momentarily absent (first paint after a
 * reload, or a silently expired token) - those land in the guest cart while
 * every authenticated read (cart view, checkout) looks at the member cart.
 * Running the merge on the identity-sensitive routes closes that gap, so the
 * basket the UI shows is the basket checkout reads.
 */
export async function syncGuestCart(req: AuthedRequest, _res: Response, next: NextFunction) {
  try {
    const sessionId = (req as Request & { sessionId?: string }).sessionId;
    if (req.user?.sub && sessionId) await mergeGuestCart(sessionId, req.user.sub);
    return next();
  } catch (err) {
    return next(err);
  }
}
