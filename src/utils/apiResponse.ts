import type { Response } from 'express';
import type { Paginated } from '../types';
import { normalizeIds } from './serialize';

export interface SuccessBody<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export function ok<T>(res: Response, data: T, meta?: Record<string, unknown>, status = 200) {
  const body: SuccessBody<T> = { success: true, data: normalizeIds(data) };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

export function created<T>(res: Response, data: T, meta?: Record<string, unknown>) {
  return ok(res, data, meta, 201);
}

export function noContent(res: Response) {
  return res.status(204).send();
}

export function paginated<T>(res: Response, page: Paginated<T>, meta?: Record<string, unknown>) {
  return ok(res, page.items, {
    ...meta,
    pagination: {
      page: page.page,
      limit: page.limit,
      total: page.total,
      totalPages: page.totalPages,
      hasNext: page.hasNext,
      hasPrev: page.hasPrev,
    },
  });
}
