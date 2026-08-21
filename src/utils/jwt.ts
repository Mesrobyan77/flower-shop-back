import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { ApiError } from './ApiError';
import type { AuthTokenPayload } from '../types';
import type { UserRole } from '../constants';

interface Identity {
  id: string;
  email: string;
  role: UserRole;
}

export function signAccessToken(user: Identity): string {
  const payload: AuthTokenPayload = { sub: user.id, email: user.email, role: user.role, tokenType: 'access' };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as SignOptions);
}

export function signRefreshToken(user: Identity): string {
  const payload: AuthTokenPayload = { sub: user.id, email: user.email, role: user.role, tokenType: 'refresh' };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_EXPIRES_IN } as SignOptions);
}

export function verifyAccessToken(token: string): AuthTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
    if (decoded.tokenType !== 'access') throw new Error('wrong token type');
    return decoded;
  } catch {
    throw ApiError.unauthorized('Session expired or invalid, please sign in again');
  }
}

export function verifyRefreshToken(token: string): AuthTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as AuthTokenPayload;
    if (decoded.tokenType !== 'refresh') throw new Error('wrong token type');
    return decoded;
  } catch {
    throw ApiError.unauthorized('Refresh token is invalid, please sign in again');
  }
}
