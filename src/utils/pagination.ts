import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../constants';
import type { Paginated } from '../types';

/**
 * How far into a collection a caller may page. An unbounded `page` is a free
 * database workload - `skip` costs the server whether or not rows are waiting -
 * so deep pagination past the last real page is refused by simply not going.
 */
const MAX_SKIP = 10_000;

export function parsePaging(query: { page?: unknown; limit?: unknown }) {
  const rawLimit = Number(query.limit) || DEFAULT_PAGE_SIZE;
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, rawLimit));
  const page = Math.min(Math.max(1, Number(query.page) || 1), Math.floor(MAX_SKIP / limit) + 1);
  return { page, limit, skip: (page - 1) * limit };
}

export function buildPage<T>(items: T[], total: number, page: number, limit: number): Paginated<T> {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    items,
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}
