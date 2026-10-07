/**
 * Delivery dates are calendar days in the shop's own timezone (Armenia), not
 * instants. The process clock is never consulted for wall time: parts come from
 * Intl with an explicit timeZone, and calendar days convert back to instants
 * arithmetically, so a UTC server and a Yerevan client agree. Formatting through
 * `toISOString()` would shift days by the UTC offset and hand the customer
 * yesterday, so all conversion goes through these helpers.
 */

export const SHOP_TIME_ZONE = 'Asia/Yerevan';

const SHOP_CLOCK_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: SHOP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export interface ShopClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Wall-clock reading of the shop timezone at the given instant. */
export function shopClock(date: Date): ShopClock {
  const parts = SHOP_CLOCK_FORMAT.formatToParts(date);
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
  const hour = pick('hour');
  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    // Some ICU builds spell midnight as 24 even when h23 was requested.
    hour: hour === 24 ? 0 : hour,
    minute: pick('minute'),
    second: pick('second'),
  };
}

/** Shop calendar day as YYYY-MM-DD. */
export function toDateKey(date: Date): string {
  const { year, month, day } = shopClock(date);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Milliseconds the shop zone is ahead of UTC at the given instant. */
function shopOffsetMs(date: Date): number {
  const { year, month, day, hour, minute, second } = shopClock(date);
  return Date.UTC(year, month - 1, day, hour, minute, second) - Math.floor(date.getTime() / 1000) * 1000;
}

/** Instant at which the shop clock shows the given wall time; second pass keeps it right even across a rules change. */
function shopWallToInstant(year: number, month: number, day: number): Date {
  const wallAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const guess = wallAsUtc - shopOffsetMs(new Date(wallAsUtc));
  return new Date(wallAsUtc - shopOffsetMs(new Date(guess)));
}

/** Parses YYYY-MM-DD as shop midnight; anything else falls back to Date parsing. */
export function fromDateKey(value: string | Date): Date {
  if (value instanceof Date) return value;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (match) return shopWallToInstant(Number(match[1]), Number(match[2]), Number(match[3]));

  return new Date(value);
}

/** Midnight of the shop calendar day containing the instant. */
export function startOfShopDay(date: Date): Date {
  return fromDateKey(toDateKey(date));
}

/** First moment of the shop calendar month containing the instant. */
export function startOfShopMonth(date: Date): Date {
  const { year, month } = shopClock(date);
  return shopWallToInstant(year, month, 1);
}

/** Last millisecond of the shop calendar day named by a YYYY-MM-DD key. */
export function endOfDateKey(value: string): Date {
  return new Date(fromDateKey(value).getTime() + 24 * 60 * 60 * 1000 - 1);
}

/** Hour of day 0-23 on the shop clock. */
export function shopHour(date: Date): number {
  return shopClock(date).hour;
}

/** 0 = Sunday … 6 = Saturday for the shop calendar day containing the instant. */
export function shopWeekday(date: Date): number {
  const { year, month, day } = shopClock(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}
