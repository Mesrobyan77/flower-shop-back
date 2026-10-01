import type { Request, Response } from 'express';
import { Order } from '../models/Order';
import { findOrders } from '../repositories/order.repository';
import * as orderService from '../services/order.service';
import { deliveryCalendar, earliestDeliveryDate, availableTimeSlots, methodsForRegion, quoteDelivery } from '../services/delivery.service';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { toDateKey } from '../utils/dateKey';
import { created, ok, paginated } from '../utils/apiResponse';
import { parsePaging } from '../utils/pagination';
import { DELIVERY_METHODS, REGIONS, type DeliveryMethod, type Locale } from '../constants';
import type { AuthedRequest } from '../types';

export const checkout = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const result = await orderService.checkout(req.body, {
    userId: req.user?.sub,
    sessionId: (req as Request & { sessionId?: string }).sessionId,
    locale: (req.query.locale as Locale) || undefined,
  });
  return created(res, result);
});

export const myOrders = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const { page, limit } = parsePaging(req.query);
  const q = req.query as Record<string, string | undefined>;
  const result = await findOrders({ page, limit, userId: req.user!.sub, status: q.status as never });
  return paginated(res, result);
});

export const myOrderDetail = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const order = await Order.findOne({ code: req.params.code, user: req.user!.sub });
  if (!order) throw ApiError.notFound('Order not found');
  return ok(res, order);
});

export const cancelMine = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const order = await Order.findOne({ code: req.params.code, user: req.user!.sub });
  if (!order) throw ApiError.notFound('Order not found');
  const updated = await orderService.cancelOwnOrder(String(order._id), req.user!.sub, req.body?.reason);
  return ok(res, updated);
});

/** Guest lookup - the reference exposed the same thing on its non-member tab. */
export const guestLookup = asyncHandler(async (req: Request, res: Response) => {
  const order = await orderService.findGuestOrder(req.body.code, req.body.email);
  return ok(res, order);
});

export const deliveryOptions = asyncHandler(async (_req: Request, res: Response) => {
  const methods = DELIVERY_METHODS.map((method) => ({
    method,
    earliestDate: toDateKey(earliestDeliveryDate(method)),
    timeSlots: availableTimeSlots(method),
    calendar: deliveryCalendar(method, 30),
  }));

  return ok(res, {
    methods,
    regions: REGIONS.map((r) => ({ key: r.key, quick: r.quick, remote: r.remote, methods: methodsForRegion(r.key) })),
  });
});

export const deliveryQuote = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as unknown as { method: DeliveryMethod; region: string; subtotal: number };
  return ok(res, quoteDelivery(q.method, q.region, Number(q.subtotal) || 0));
});
