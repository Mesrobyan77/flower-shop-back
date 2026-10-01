import type { NextFunction, Response } from 'express';
import { ApiError } from '../utils/ApiError';
import { verifyAccessToken } from '../utils/jwt';
import type { AuthedRequest } from '../types';
import type { UserRole } from '../constants';

function extractToken(req: AuthedRequest): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7).trim();
  // Access tokens are header-only by contract; cookies carry the refresh and
  // guest sessions, never an access token.
  return null;
}

/** Hard gate: 401 when no valid access token is present. */
export function requireAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return next(ApiError.unauthorized());
  try {
    req.user = verifyAccessToken(token);
    return next();
  } catch (err) {
    return next(err);
  }
}

/** Soft gate: attaches the user when a token is present, never rejects. */
export function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return next();
  try {
    req.user = verifyAccessToken(token);
  } catch {
    // ignore an expired token on public endpoints
  }
  return next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthedRequest, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) return next(ApiError.forbidden());
    return next();
  };
}

export const requireAdmin = [requireAuth, requireRole('admin')];
