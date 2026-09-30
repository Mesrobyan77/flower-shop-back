import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { ApiError } from './ApiError';
import type { AuthTokenPayload } from '../types';
import type { UserRole } from '../constants';

/**
 * Both secrets are symmetric, so every token this service issues is HS256 and
 * nothing else is ever accepted. Pinning the algorithm on sign and verify keeps a
 * token minted with a different scheme - including the unsigned `alg: none`
 * header - from ever reaching the payload check below.
 */
const TOKEN_ALGORITHM = 'HS256' as const;

interface Identity {
  id: string;
  email: string;
  role: UserRole;
}

/**
 * Refresh tokens are single-use: `jti` names the row that must still be
 * claimable, `fid` groups every rotation of one login so logout can revoke the
 * family at once. Tokens minted before these claims existed are refused.
 */
export interface RefreshClaims {
  /** Unique id of this token's server-side session row. */
  jti: string;
  /** Session family shared by every rotation of this login. */
  fid: string;
}

export function signAccessToken(user: Identity): string {
  const payload: AuthTokenPayload = { sub: user.id, email: user.email, role: user.role, tokenType: 'access' };
  return jwt.sign(payload, env.JWT_SECRET, { algorithm: TOKEN_ALGORITHM, expiresIn: env.JWT_EXPIRES_IN } as SignOptions);
}

export function signRefreshToken(user: Identity, claims: RefreshClaims): string {
  const payload: AuthTokenPayload = { sub: user.id, email: user.email, role: user.role, tokenType: 'refresh', ...claims };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    algorithm: TOKEN_ALGORITHM,
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  } as SignOptions);
}

export function verifyAccessToken(token: string): AuthTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: [TOKEN_ALGORITHM] }) as AuthTokenPayload;
    if (decoded.tokenType !== 'access') throw new Error('wrong token type');
    return decoded;
  } catch {
    throw ApiError.unauthorized('Session expired or invalid, please sign in again');
  }
}

export function verifyRefreshToken(token: string): AuthTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: [TOKEN_ALGORITHM] }) as AuthTokenPayload;
    if (decoded.tokenType !== 'refresh') throw new Error('wrong token type');
    // A refresh token without a session id predates rotation tracking or was
    // assembled by hand; either way it must never be able to claim a session.
    if (!decoded.jti || !decoded.fid) throw new Error('missing session claims');
    return decoded;
  } catch {
    throw ApiError.unauthorized('Refresh token is invalid, please sign in again');
  }
}

/**
 * Lifetime remaining on a token we have just signed, in milliseconds. The
 * refresh cookie's Max-Age is derived from it so the browser and the server
 * always agree on when a session ends, whatever `JWT_REFRESH_EXPIRES_IN` holds.
 */
export function tokenTtlMs(token: string): number {
  const claims = jwt.decode(token) as { exp?: number } | null;
  if (!claims?.exp) throw new Error('token does not carry an expiry');
  return Math.max(1000, Math.round(claims.exp * 1000 - Date.now()));
}

