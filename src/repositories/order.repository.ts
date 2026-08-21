import type { FilterQuery } from 'mongoose';
import { Order, type OrderDocument } from '../models/Order';
import { buildPage } from '../utils/pagination';
import type { OrderStatus, PaymentStatus } from '../constants';
import { containsRegex } from '../utils/regex';

export interface OrderQuery {
  page: number;
  limit: number;
  userId?: string;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  search?: string;
  from?: Date;
  to?: Date;
}

export function buildOrderFilter(q: OrderQuery): FilterQuery<OrderDocument> {
  const filter: FilterQuery<OrderDocument> = {};
  if (q.userId) filter.user = q.userId;
  if (q.status) filter.status = q.status;
  if (q.paymentStatus) filter.paymentStatus = q.paymentStatus;

  if (q.from || q.to) {
    filter.createdAt = {};
    if (q.from) filter.createdAt.$gte = q.from;
    if (q.to) filter.createdAt.$lte = q.to;
  }

  if (q.search?.trim()) {
    const rx = containsRegex(q.search.trim());
    filter.$or = [{ code: rx }, { 'customer.name': rx }, { 'customer.email': rx }, { 'customer.phone': rx }];
  }

  return filter;
}

export async function findOrders(q: OrderQuery) {
  const filter = buildOrderFilter(q);
  const skip = (q.page - 1) * q.limit;

  const [items, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(q.limit).lean(),
    Order.countDocuments(filter),
  ]);

  return buildPage(items, total, q.page, q.limit);
}

export function findOrderByCode(code: string) {
  return Order.findOne({ code });
}
