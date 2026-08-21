import { gradeByKey, type MemberGradeKey } from '../constants';
import { applyRate, clampNonNegative, round, sum } from '../utils/money';
import type { SelectedOption } from '../models/Cart';

export interface PriceableItem {
  unitPrice: number;
  quantity: number;
  options: Pick<SelectedOption, 'priceDelta'>[];
}

export interface LineTotals {
  optionsTotal: number;
  lineTotal: number;
}

/** Option surcharges apply per unit, exactly as the reference add-on selects did. */
export function lineTotals(item: PriceableItem): LineTotals {
  const optionDelta = sum(item.options.map((o) => o.priceDelta ?? 0));
  const optionsTotal = round(optionDelta * item.quantity);
  const lineTotal = round((item.unitPrice + optionDelta) * item.quantity);
  return { optionsTotal, lineTotal };
}

export interface CartTotalsInput {
  items: PriceableItem[];
  gradeKey?: MemberGradeKey | string;
  deliveryFee?: number;
  deliverySurcharge?: number;
  pointsUsed?: number;
}

export interface CartTotals {
  subtotal: number;
  optionsTotal: number;
  merchandiseTotal: number;
  gradeDiscount: number;
  gradeDiscountRate: number;
  deliveryFee: number;
  deliverySurcharge: number;
  pointsUsed: number;
  total: number;
  pointsEarned: number;
}

/**
 * Order of operations mirrors the reference: grade discount applies to the
 * merchandise total, delivery is added afterwards, points are deducted last and
 * points are earned on the post-discount merchandise value only.
 */
export function calculateTotals(input: CartTotalsInput): CartTotals {
  const grade = gradeByKey(String(input.gradeKey ?? 'general'));

  const perLine = input.items.map((item) => lineTotals(item));
  const subtotal = sum(input.items.map((item) => round(item.unitPrice * item.quantity)));
  const optionsTotal = sum(perLine.map((l) => l.optionsTotal));
  const merchandiseTotal = sum(perLine.map((l) => l.lineTotal));

  const gradeDiscount = applyRate(merchandiseTotal, grade.discountRate);
  const deliveryFee = input.deliveryFee ?? 0;
  const deliverySurcharge = input.deliverySurcharge ?? 0;

  const payableBeforePoints = clampNonNegative(merchandiseTotal - gradeDiscount + deliveryFee + deliverySurcharge);
  const pointsUsed = Math.min(clampNonNegative(input.pointsUsed ?? 0), payableBeforePoints);
  const total = clampNonNegative(payableBeforePoints - pointsUsed);
  const pointsEarned = applyRate(clampNonNegative(merchandiseTotal - gradeDiscount), grade.pointRate);

  return {
    subtotal,
    optionsTotal,
    merchandiseTotal,
    gradeDiscount,
    gradeDiscountRate: grade.discountRate,
    deliveryFee,
    deliverySurcharge,
    pointsUsed,
    total,
    pointsEarned,
  };
}
