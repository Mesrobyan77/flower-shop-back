import { env } from '../config/env';
import {
  PARCEL_LEAD_DAYS,
  QUICK_CUTOFF_HOUR,
  QUICK_SLOT_END,
  QUICK_SLOT_START,
  TIME_SLOTS,
  regionByKey,
  type DeliveryMethod,
} from '../constants';
import { ApiError } from '../utils/ApiError';
import { fromDateKey, shopHour, shopWeekday, startOfShopDay, toDateKey } from '../utils/dateKey';

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = startOfShopDay;

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

/** Weekends are the shop's (Armenia) weekends, never the process clock's. */
function isWeekend(d: Date): boolean {
  const day = shopWeekday(d);
  return day === 0 || day === 6;
}

/**
 * Reference behaviour: the product page showed a different "delivery possible
 * from" date per method (quick 08/24, parcel 08/22). Quick is same-day until the
 * cutoff and never runs on weekends; parcel always needs a lead day.
 */
export function earliestDeliveryDate(method: DeliveryMethod, now = new Date()): Date {
  if (method === 'pickup') return startOfDay(now);

  if (method === 'quick') {
    let candidate = shopHour(now) >= QUICK_CUTOFF_HOUR ? addDays(startOfDay(now), 1) : startOfDay(now);
    while (isWeekend(candidate)) candidate = addDays(candidate, 1);
    return candidate;
  }

  let candidate = addDays(startOfDay(now), PARCEL_LEAD_DAYS);
  while (isWeekend(candidate)) candidate = addDays(candidate, 1);
  return candidate;
}

/** Quick courier works a narrower window than the full 09:00-22:00 slot list. */
export function availableTimeSlots(method: DeliveryMethod): string[] {
  if (method !== 'quick') return [];
  return TIME_SLOTS.filter((slot) => slot >= QUICK_SLOT_START && slot <= QUICK_SLOT_END);
}

export function methodsForRegion(regionKey: string): DeliveryMethod[] {
  const region = regionByKey(regionKey);
  if (!region) return [];
  const methods: DeliveryMethod[] = ['pickup'];
  if (region.quick) methods.unshift('quick');
  methods.splice(region.quick ? 1 : 0, 0, 'parcel');
  return methods;
}

export interface DeliveryQuote {
  method: DeliveryMethod;
  fee: number;
  surcharge: number;
  total: number;
  freeThreshold: number | null;
  isFree: boolean;
}

/** Parcel is free above a threshold; remote marzer add a surcharge. */
export function quoteDelivery(method: DeliveryMethod, regionKey: string, merchandiseTotal: number): DeliveryQuote {
  const region = regionByKey(regionKey);
  if (!region) throw ApiError.badRequest(`Unknown region: ${regionKey}`);

  if (method === 'pickup') {
    return { method, fee: 0, surcharge: 0, total: 0, freeThreshold: null, isFree: true };
  }

  if (method === 'quick') {
    if (!region.quick) throw ApiError.badRequest('Express delivery is not available in this region');
    return { method, fee: env.QUICK_FEE, surcharge: 0, total: env.QUICK_FEE, freeThreshold: null, isFree: false };
  }

  const isFree = merchandiseTotal >= env.FREE_PARCEL_THRESHOLD;
  const fee = isFree ? 0 : env.PARCEL_FEE;
  const surcharge = region.remote ? env.RURAL_SURCHARGE : 0;

  return {
    method,
    fee,
    surcharge,
    total: fee + surcharge,
    freeThreshold: env.FREE_PARCEL_THRESHOLD,
    isFree,
  };
}

export interface DeliveryValidationInput {
  method: DeliveryMethod;
  regionKey: string;
  requestedDate?: Date | string | null;
  timeSlot?: string | null;
  now?: Date;
}

/** Rejects impossible combinations before an order is written. */
export function validateDeliverySelection(input: DeliveryValidationInput): void {
  const { method, regionKey, timeSlot } = input;
  const now = input.now ?? new Date();
  const region = regionByKey(regionKey);

  if (!region) throw ApiError.badRequest(`Unknown region: ${regionKey}`);
  if (method === 'quick' && !region.quick) {
    throw ApiError.badRequest('Express delivery is not available in this region');
  }

  if (input.requestedDate) {
    const requested = startOfDay(fromDateKey(input.requestedDate as string | Date));
    if (Number.isNaN(requested.getTime())) throw ApiError.badRequest('Invalid delivery date');

    const earliest = earliestDeliveryDate(method, now);
    if (requested < earliest) {
      throw ApiError.badRequest(`The earliest available delivery date is ${toDateKey(earliest)}`);
    }
    if (method === 'quick' && isWeekend(requested)) {
      throw ApiError.badRequest('Express delivery does not run on weekends');
    }
  }

  if (timeSlot) {
    if (method !== 'quick') throw ApiError.badRequest('Time slots are only available for express delivery');
    if (!availableTimeSlots('quick').includes(timeSlot)) throw ApiError.badRequest(`Invalid time slot: ${timeSlot}`);
  }
}

/** Calendar payload the storefront date picker consumes. */
export function deliveryCalendar(method: DeliveryMethod, days = 30, now = new Date()) {
  const earliest = earliestDeliveryDate(method, now);
  const out: { date: string; available: boolean; reason?: string }[] = [];

  for (let i = 0; i < days; i += 1) {
    const date = addDays(earliest, i);
    const weekendBlocked = method === 'quick' && isWeekend(date);
    out.push({
      date: toDateKey(date),
      available: !weekendBlocked,
      reason: weekendBlocked ? 'weekend' : undefined,
    });
  }
  return out;
}
