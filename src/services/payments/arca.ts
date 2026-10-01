import { env } from '../../config/env';
import type { Locale } from '../../constants';

/**
 * ArCa iPay REST client (Compass Plus EPG platform). Redirect flow only: the
 * cardholder pays on the provider-hosted page, so no card data ever reaches
 * this server.
 *
 * Verified against the official ArCa integration documentation:
 *  - register.do returns { orderId, formUrl } for one-stage payments; the
 *    amount is an integer in the currency's minor denomination and the
 *    currency is the ISO 4217 numeric code (AMD = 051).
 *  - getOrderStatusExtended.do is the authoritative server-side verification:
 *    orderStatus 2 = deposited/paid, 6 = declined, 3 = reversed,
 *    4 = refunded, 0/1/5 = not completed yet.
 */

export class ArcaError extends Error {
  code?: string;
  /** register.do refused the orderNumber because EPG already knows it. */
  duplicateOrderNumber = false;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'ArcaError';
    this.code = code;
  }
}

/** AMD's minor unit is the luma (1/100). Banks that settle in whole drams
 *  configure ARCA_AMOUNT_MULTIPLIER=1. */
export function toMinorUnits(amount: number): number {
  return Math.round(amount * env.payments.arca.amountMultiplier);
}

const AMD_CURRENCY_NUMERIC = '051';
const REQUEST_TIMEOUT_MS = 20_000;

async function post(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const cfg = env.payments.arca;
  const body = new URLSearchParams({ userName: cfg.username, password: cfg.password, ...params });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let payload: Record<string, unknown>;
  try {
    const response = await fetch(`${cfg.apiBaseUrl}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body,
      signal: controller.signal,
    });
    if (!response.ok) throw new ArcaError(`ArCa gateway HTTP ${response.status}`);
    const text = await response.text();
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new ArcaError('ArCa gateway returned a non-JSON response');
    }
  } catch (error) {
    if (error instanceof ArcaError) throw error;
    if ((error as Error).name === 'AbortError') throw new ArcaError('ArCa gateway timed out');
    throw new ArcaError((error as Error).message || 'ArCa gateway is unreachable');
  } finally {
    clearTimeout(timer);
  }

  const errorCode = payload.errorCode === undefined ? '0' : String(payload.errorCode);
  if (errorCode !== '0') {
    const message = String(payload.errorMessage ?? `ArCa errorCode ${errorCode}`);
    const failure = new ArcaError(message, errorCode);
    if (/duplicat|already (?:exists|registered|used)/i.test(message)) failure.duplicateOrderNumber = true;
    throw failure;
  }
  return payload;
}

export interface ArcaRegistration {
  orderId: string;
  formUrl: string;
}

export async function registerOrder(params: {
  orderNumber: string;
  amount: number;
  description: string;
  returnUrl: string;
  locale: Locale;
}): Promise<ArcaRegistration> {
  const payload = await post('register.do', {
    orderNumber: params.orderNumber,
    amount: String(toMinorUnits(params.amount)),
    currency: AMD_CURRENCY_NUMERIC,
    returnUrl: params.returnUrl,
    description: params.description,
    language: params.locale,
  });
  const orderId = String(payload.orderId ?? '');
  const formUrl = String(payload.formUrl ?? '');
  if (!orderId || !formUrl) throw new ArcaError('ArCa gateway did not return a payment page URL');
  return { orderId, formUrl };
}

export interface ArcaOrderStatus {
  orderStatus: number;
  amount?: number;
}

export async function getOrderStatusExtended(orderId: string, locale: Locale): Promise<ArcaOrderStatus> {
  const payload = await post('getOrderStatusExtended.do', {
    orderId,
    language: locale,
  });
  return {
    orderStatus: Number(payload.orderStatus ?? -1),
    amount: payload.amount === undefined ? undefined : Number(payload.amount),
  };
}
