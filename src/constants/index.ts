/* ---------------------------------------------------------------------------
 * Domain constants. Mirrors the business rules reverse-engineered from the
 * reference storefront (see docs/REFERENCE-ANALYSIS.md), localized to Armenia.
 * ------------------------------------------------------------------------- */

export const LOCALES = ['hy', 'en', 'ru'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'hy';

/** Reference had 퀵배송 (same-day courier) and 택배 (parcel). */
export const DELIVERY_METHODS = ['quick', 'parcel', 'pickup'] as const;
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];

/** 주문결제 > 상품제작 > 배송 > 배송완료, plus explicit confirm/cancel states. */
export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'preparing',
  'delivering',
  'delivered',
  'completed',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const CANCELLABLE_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'preparing'];

export const ORDER_STATUS_FLOW: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['delivering', 'cancelled'],
  delivering: ['delivered', 'cancelled'],
  delivered: ['completed'],
  completed: [],
  cancelled: [],
};

export const PAYMENT_METHODS = ['cash_on_delivery', 'idram', 'arca'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Online methods are settled by a provider; COD settles on delivery. */
export const ONLINE_PAYMENT_METHODS: PaymentMethod[] = ['idram', 'arca'];

export const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'cancelled', 'refunded'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const USER_ROLES = ['user', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/**
 * Member grade ladder — reference: 일반 / 씨앗 / 새싹 / 잎사귀 / 가지 / 꽃 / 나무
 * (general / seed / sprout / leaf / branch / flower / tree), 0–5 % extra discount,
 * 7 % points accrual for everyone.
 */
export const MEMBER_GRADES = [
  { key: 'general', order: 0, discountRate: 0, pointRate: 0.07, minSpend: 0 },
  { key: 'seed', order: 1, discountRate: 0, pointRate: 0.07, minSpend: 30_000 },
  { key: 'sprout', order: 2, discountRate: 0.01, pointRate: 0.07, minSpend: 100_000 },
  { key: 'leaf', order: 3, discountRate: 0.02, pointRate: 0.07, minSpend: 250_000 },
  { key: 'branch', order: 4, discountRate: 0.03, pointRate: 0.07, minSpend: 500_000 },
  { key: 'flower', order: 5, discountRate: 0.04, pointRate: 0.07, minSpend: 1_000_000 },
  { key: 'tree', order: 6, discountRate: 0.05, pointRate: 0.07, minSpend: 2_000_000 },
] as const;

export type MemberGradeKey = (typeof MEMBER_GRADES)[number]['key'];
export const MEMBER_GRADE_KEYS = MEMBER_GRADES.map((g) => g.key) as unknown as MemberGradeKey[];

export function gradeForSpend(totalSpend: number) {
  return [...MEMBER_GRADES].reverse().find((g) => totalSpend >= g.minSpend) ?? MEMBER_GRADES[0];
}

export function gradeByKey(key: string) {
  return MEMBER_GRADES.find((g) => g.key === key) ?? MEMBER_GRADES[0];
}

/** Reference offered 09:00–22:00 in 30-minute steps; quick courier works 10:00–20:00. */
export const TIME_SLOTS: string[] = (() => {
  const out: string[] = [];
  for (let h = 9; h <= 22; h += 1) {
    out.push(`${String(h).padStart(2, '0')}:00`);
    if (h !== 22) out.push(`${String(h).padStart(2, '0')}:30`);
  }
  return out;
})();

export const QUICK_SLOT_START = '10:00';
export const QUICK_SLOT_END = '20:00';

/** Quick courier lead time in hours; orders after the cutoff roll to the next day. */
export const QUICK_LEAD_HOURS = 3;
export const QUICK_CUTOFF_HOUR = 17;
export const PARCEL_LEAD_DAYS = 1;

/** Armenian marzer (regions). Yerevan is the quick-delivery zone. */
export const REGIONS = [
  { key: 'yerevan', quick: true, remote: false },
  { key: 'aragatsotn', quick: false, remote: false },
  { key: 'ararat', quick: false, remote: false },
  { key: 'armavir', quick: false, remote: false },
  { key: 'gegharkunik', quick: false, remote: false },
  { key: 'lori', quick: false, remote: false },
  { key: 'kotayk', quick: true, remote: false },
  { key: 'shirak', quick: false, remote: false },
  { key: 'syunik', quick: false, remote: true },
  { key: 'vayots_dzor', quick: false, remote: true },
  { key: 'tavush', quick: false, remote: true },
] as const;

export type RegionKey = (typeof REGIONS)[number]['key'];
export const REGION_KEYS = REGIONS.map((r) => r.key) as unknown as RegionKey[];

export function regionByKey(key: string) {
  return REGIONS.find((r) => r.key === key);
}

export const PRODUCT_BADGES = ['new', 'best', 'sale', 'today', 'subscription_only'] as const;
export type ProductBadge = (typeof PRODUCT_BADGES)[number];

export const POST_TYPES = ['magazine', 'notice', 'faq', 'event'] as const;
export type PostType = (typeof POST_TYPES)[number];

export const SUBSCRIPTION_CYCLES = ['weekly', 'biweekly', 'monthly'] as const;
export type SubscriptionCycle = (typeof SUBSCRIPTION_CYCLES)[number];

export const SUBSCRIPTION_STATUSES = ['active', 'paused', 'cancelled'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const SORT_OPTIONS = ['recommended', 'newest', 'price_asc', 'price_desc', 'popular', 'review'] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

export const MAX_PAGE_SIZE = 60;
export const DEFAULT_PAGE_SIZE = 20;
