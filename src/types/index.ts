import type { Request } from 'express';
import type { UserRole } from '../constants';

export interface AuthTokenPayload {
  sub: string;
  role: UserRole;
  email: string;
  tokenType: 'access' | 'refresh';
}

export interface AuthedRequest extends Request {
  user?: AuthTokenPayload;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface LocalizedText {
  hy: string;
  en?: string;
  ru?: string;
}
