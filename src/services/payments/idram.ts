import crypto from 'crypto';
import { env } from '../../config/env';
import type { Locale } from '../../constants';

/**
 * Idram Wallet merchant interface (per the official "Idram Payment System
 * merchant interface description").
 *
 * Payment initiation is an HTML form POST to the hosted payment page; the
 * merchant parameters SUCCESS_URL / FAIL_URL / RESULT_URL / SECRET_KEY / EMAIL
 * are registered on Idram's side, not sent in the form.
 *
 * Trust model: the browser redirects (SUCCESS_URL / FAIL_URL) are hints. The
 * only payable proof of payment is the server-to-server confirmation posted to
 * RESULT_URL with a valid MD5 checksum.
 */

const EDP_LANGUAGE: Record<Locale, string> = { hy: 'AM', en: 'EN', ru: 'RU' };

export interface IdramForm {
  action: string;
  fields: Record<string, string>;
}

export function buildIdramForm(params: {
  amount: number;
  billNo: string;
  description: string;
  email?: string;
  locale: Locale;
}): IdramForm {
  const cfg = env.payments.idram;
  const fields: Record<string, string> = {
    EDP_LANGUAGE: EDP_LANGUAGE[params.locale],
    EDP_REC_ACCOUNT: cfg.recAccount,
    EDP_DESCRIPTION: params.description,
    EDP_AMOUNT: String(params.amount),
    EDP_BILL_NO: params.billNo,
  };
  if (params.email) fields.EDP_EMAIL = params.email;
  return { action: cfg.paymentUrl, fields };
}

export function isIdramPrecheck(body: Record<string, unknown>): boolean {
  return body.EDP_PRECHECK === 'YES';
}

/**
 * MD5 of colon-joined EDP_REC_ACCOUNT:EDP_AMOUNT:SECRET_KEY:EDP_BILL_NO:
 * EDP_PAYER_ACCOUNT:EDP_TRANS_ID:EDP_TRANS_DATE - hashed exactly as received.
 */
export function idramChecksumMatches(body: Record<string, unknown>): boolean {
  const received = String(body.EDP_CHECKSUM ?? '').toLowerCase();
  if (!received) return false;
  const text = [
    String(body.EDP_REC_ACCOUNT ?? ''),
    String(body.EDP_AMOUNT ?? ''),
    env.payments.idram.secretKey,
    String(body.EDP_BILL_NO ?? ''),
    String(body.EDP_PAYER_ACCOUNT ?? ''),
    String(body.EDP_TRANS_ID ?? ''),
    String(body.EDP_TRANS_DATE ?? ''),
  ].join(':');
  const expected = crypto.createHash('md5').update(text, 'utf8').digest('hex');
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
