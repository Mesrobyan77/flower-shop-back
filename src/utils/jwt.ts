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

export function signAccessToken(user: Identity): string {
  const payload: AuthTokenPayload = { sub: user.id, email: user.email, role: user.role, tokenType: 'access' };
  return jwt.sign(payload, env.JWT_SECRET, { algorithm: TOKEN_ALGORITHM, expiresIn: env.JWT_EXPIRES_IN } as SignOptions);
}

export function signRefreshToken(user: Identity): string {
  const payload: AuthTokenPayload = { sub: user.id, email: user.email, role: user.role, tokenType: 'refresh' };
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
    return decoded;
  } catch {
    throw ApiError.unauthorized('Refresh token is invalid, please sign in again');
  }
}

