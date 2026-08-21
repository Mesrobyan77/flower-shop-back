import type { Response } from 'express';
import { Subscription, SubscriptionPlan } from '../models/Subscription';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { created, ok } from '../utils/apiResponse';
import { generateOrderCode } from '../utils/codes';
import type { AuthedRequest } from '../types';
import type { SubscriptionCycle } from '../constants';

const CYCLE_DAYS: Record<SubscriptionCycle, number> = { weekly: 7, biweekly: 14, monthly: 30 };

export const listPlans = asyncHandler(async (_req: AuthedRequest, res: Response) => {
  const plans = await SubscriptionPlan.find({ isActive: true }).sort({ order: 1 }).lean();
  return ok(res, plans);
});

export const subscribe = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const plan = await SubscriptionPlan.findById(req.body.planId);
  if (!plan || !plan.isActive) throw ApiError.notFound('Subscription plan not found');

  const start = req.body.startDate ? new Date(req.body.startDate) : new Date();
  const next = new Date(start.getTime() + CYCLE_DAYS[req.body.cycle as SubscriptionCycle] * 24 * 60 * 60 * 1000);

  const subscription = await Subscription.create({
    code: generateOrderCode(),
    user: req.user!.sub,
    plan: plan._id,
    cycle: req.body.cycle,
    pricePerDelivery: plan.pricePerDelivery,
    startedAt: start,
    nextDeliveryAt: next,
    recipient: req.body.recipient,
    phone: req.body.phone,
    region: req.body.region,
    city: req.body.city,
    street: req.body.street,
    building: req.body.building,
    apartment: req.body.apartment,
    notes: req.body.notes,
  });

  return created(res, subscription);
});

export const mine = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const items = await Subscription.find({ user: req.user!.sub }).populate('plan', 'name slug image').sort({ createdAt: -1 });
  return ok(res, items);
});

export const setStatus = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const status = req.params.action === 'pause' ? 'paused' : req.params.action === 'resume' ? 'active' : 'cancelled';

  const subscription = await Subscription.findOne({ _id: req.params.id, user: req.user!.sub });
  if (!subscription) throw ApiError.notFound('Subscription not found');

  subscription.status = status;
  if (status === 'paused') subscription.pausedAt = new Date();
  if (status === 'cancelled') subscription.cancelledAt = new Date();
  if (status === 'active') subscription.pausedAt = undefined;

  await subscription.save();
  return ok(res, subscription);
});
