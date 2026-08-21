/**
 * Delivery dates are calendar days in the shop's own timezone, not instants.
 * Formatting through `toISOString()` would shift them by the UTC offset and hand
 * the customer yesterday, so all conversion goes through these two helpers.
 */

/** Local calendar day as YYYY-MM-DD. */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parses YYYY-MM-DD as local midnight; anything else falls back to Date parsing. */
export function fromDateKey(value: string | Date): Date {
  if (value instanceof Date) return value;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0);

  return new Date(value);
}

export function startOfLocalDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
