import type { ClientSession } from 'mongoose';
import { env } from '../config/env';
import { DEFAULT_LOCALE, type Locale, type PaymentMethod, PAYMENT_METHODS } from '../constants';
import { Order, type OrderDocument } from '../models/Order';
import { Payment, type PaymentDocument, type PaymentProvider } from '../models/Payment';
import { ApiError } from '../utils/ApiError';
import { randomToken } from '../utils/codes';
import { buildIdramForm, idramChecksumMatches, isIdramPrecheck } from './payments/idram';
import { ArcaError, getOrderStatusExtended, registerOrder, toMinorUnits } from './payments/arca';

/**
 * Payment orchestration. Two rules dominate every path here:
 *
 * 1. Money facts come from the server. The amount is the order total that the
 *    checkout recomputed; the client never sends it and the frontend status is
 *    never consulted.
 * 2. Only a provider-verified signal marks a payment paid - Idram's checksummed
 *    RESULT_URL confirmation, ArCa's getOrderStatusExtended - never a browser
 *    redirect, never a query string.
 */

const POLL_THROTTLE_MS = 10_000;

export function providerForMethod(method: PaymentMethod): PaymentProvider | null {
  if (method === 'idram') return 'idram';
  if (method === 'arca') return 'arca';
  return null;
}

/** Availability is credential-driven; an unconfigured provider is simply hidden. */
export function paymentMethodAvailability() {
  return PAYMENT_METHODS.map((key) => ({
    key,
    enabled: key === 'cash_on_delivery' ? true : env.payments[key].enabled,
  }));
}

/** Called inside the checkout transaction so an order never exists without its
 *  online-payment record, and a rolled-back checkout leaves neither behind. */
export async function createPaymentForOrder(
  order: OrderDocument,
  provider: PaymentProvider,
  session: ClientSession,
): Promise<PaymentDocument> {
  const [payment] = await Payment.create(
    [
      {
        order: order._id,
        provider,
        amount: order.total,
        currency: env.CURRENCY,
        status: 'pending',
        returnToken: randomToken(16),
        providerRef: order.code,
      },
    ],
    { session },
  );
  return payment;
}

export interface PaymentPublic {
  provider: PaymentProvider;
  status: PaymentDocument['status'];
  amount: number;
  currency: string;
  attempts: number;
}

export interface OrderPublic {
  code: string;
  status: OrderDocument['status'];
  paymentStatus: OrderDocument['paymentStatus'];
  total: number;
  delivery: {
    recipient: string;
    requestedDate?: Date;
    timeSlot?: string;
    city: string;
    region: string;
  };
}

export interface PaymentStartResult {
  kind: 'form' | 'url' | 'paid';
  action?: string;
  fields?: Record<string, string>;
  url?: string;
  payment: PaymentPublic;
  order: OrderPublic;
}

function paymentPublic(payment: PaymentDocument): PaymentPublic {
  return {
    provider: payment.provider,
    status: payment.status,
    amount: payment.amount,
    currency: payment.currency,
    attempts: payment.attempts,
  };
}

/** What the checkout hands the browser to reach the hosted payment page. */
export interface CheckoutPaymentPayload {
  provider: PaymentProvider;
  returnToken: string;
  amount: number;
  currency: string;
}

export function checkoutPaymentPayload(payment: PaymentDocument): CheckoutPaymentPayload {
  return {
    provider: payment.provider,
    returnToken: payment.returnToken,
    amount: payment.amount,
    currency: payment.currency,
  };
}

function orderPublic(order: OrderDocument): OrderPublic {
  return {
    code: order.code,
    status: order.status,
    paymentStatus: order.paymentStatus,
    total: order.total,
    delivery: {
      recipient: order.delivery.recipient,
      requestedDate: order.delivery.requestedDate,
      timeSlot: order.delivery.timeSlot,
      city: order.delivery.city,
      region: order.delivery.region,
    },
  };
}

function providerUnavailable(provider: PaymentProvider): ApiError {
  const label = provider === 'idram' ? 'Idram' : 'ArCa';
  return new ApiError(503, `${label} payments are not configured on this server`, undefined, 'PROVIDER_UNAVAILABLE');
}

async function loadPaymentByToken(token: string): Promise<{ payment: PaymentDocument; order: OrderDocument }> {
  const payment = await Payment.findOne({ returnToken: token });
  if (!payment) throw ApiError.notFound('Payment not found');
  const order = await Order.findById(payment.order);
  if (!order) throw ApiError.notFound('Payment not found');
  return { payment, order };
}

/**
 * Idempotent payment initiation. Repeated calls (double click, refresh, two
 * tabs) return the same redirect; a provider registration is never duplicated
 * because the transition out of 'idle' is a compare-and-set lease.
 */
export async function startPayment(token: string, locale: Locale = DEFAULT_LOCALE): Promise<PaymentStartResult> {
  const { payment, order } = await loadPaymentByToken(token);

  if (payment.status === 'paid') {
    return { kind: 'paid', payment: paymentPublic(payment), order: orderPublic(order) };
  }
  if (payment.status === 'refunded') {
    throw ApiError.conflict('This payment was refunded - a new order is required');
  }
  if (order.status === 'cancelled') {
    throw ApiError.conflict('This order was cancelled and can no longer be paid');
  }
  if (!env.payments[payment.provider].enabled) throw providerUnavailable(payment.provider);

  if (payment.provider === 'idram') {
    // The Idram payment page is a plain form POST - no server registration to
    // deduplicate beyond returning the same bill number every time.
    if (payment.checkState !== 'ready') {
      await Payment.updateOne({ _id: payment._id }, { $set: { checkState: 'ready' } });
    }
    const form = buildIdramForm({
      amount: payment.amount,
      billNo: payment.providerRef,
      description: `Order ${order.code}`,
      email: order.customer.email,
      locale,
    });
    return {
      kind: 'form',
      action: form.action,
      fields: form.fields,
      payment: paymentPublic(payment),
      order: orderPublic(order),
    };
  }

  // ArCa: an existing registration is reused as-is, so a repeated init can
  // never register a second order on the gateway.
  if (payment.checkState === 'ready' && payment.formUrl && payment.status === 'pending') {
    return { kind: 'url', url: payment.formUrl, payment: paymentPublic(payment), order: orderPublic(order) };
  }

  const attempt = payment.attempts + 1;
  const providerRef = attempt === 1 ? order.code : `${order.code}-${attempt}`;
  const lease = await Payment.findOneAndUpdate(
    { _id: payment._id, status: { $in: ['pending', 'failed', 'cancelled'] }, checkState: { $ne: 'starting' } },
    { $set: { checkState: 'starting', providerRef, attempts: attempt, status: 'pending' }, $unset: { lastError: 1 } },
    { new: true },
  );
  if (!lease) {
    // Another request holds the lease, or the state moved under us.
    const fresh = await Payment.findById(payment._id);
    if (fresh?.status === 'paid') {
      return { kind: 'paid', payment: paymentPublic(fresh), order: orderPublic(order) };
    }
    if (fresh?.checkState === 'ready' && fresh.formUrl && fresh.status === 'pending') {
      return { kind: 'url', url: fresh.formUrl, payment: paymentPublic(fresh), order: orderPublic(order) };
    }
    throw ApiError.conflict('The payment is being prepared - please retry in a moment');
  }

  const returnUrl = `${env.payments.appFrontendUrl}/${locale}/checkout/payment/return?token=${payment.returnToken}`;
  const description = `Order ${order.code}`;

  let registration: { orderId: string; formUrl: string };
  try {
    registration = await registerOrder({
      orderNumber: lease.providerRef,
      amount: lease.amount,
      description,
      returnUrl,
      locale,
    });
  } catch (error) {
    if (error instanceof ArcaError && error.duplicateOrderNumber) {
      // EPG remembers every orderNumber it has ever seen; rotate and retry once.
      const retryRef = `${order.code}-${attempt + 1}`;
      try {
        registration = await registerOrder({
          orderNumber: retryRef,
          amount: lease.amount,
          description,
          returnUrl,
          locale,
        });
        await Payment.updateOne({ _id: lease._id }, { $set: { providerRef: retryRef, attempts: attempt + 1 } });
      } catch (retryError) {
        await releaseLease(lease._id, (retryError as Error).message);
        throw new ApiError(502, 'Bank card payments are temporarily unavailable', undefined, 'PROVIDER_ERROR');
      }
    } else {
      await releaseLease(lease._id, (error as Error).message);
      throw new ApiError(502, 'Bank card payments are temporarily unavailable', undefined, 'PROVIDER_ERROR');
    }
  }

  await Payment.updateOne(
    { _id: lease._id },
    { $set: { checkState: 'ready', providerOrderId: registration.orderId, formUrl: registration.formUrl } },
  );
  const fresh = (await Payment.findById(lease._id)) as PaymentDocument;
  return { kind: 'url', url: registration.formUrl, payment: paymentPublic(fresh), order: orderPublic(order) };
}

async function releaseLease(paymentId: unknown, message: string) {
  await Payment.updateOne(
    { _id: paymentId, checkState: 'starting' },
    { $set: { checkState: 'idle', lastError: message.slice(0, 400) } },
  );
}

/**
 * Authoritative status for the return page. ArCa additionally polls the
 * gateway (throttled) so a returning cardholder sees the verified outcome, not
 * the redirect's claims.
 */
export async function getPaymentStatus(token: string, locale: Locale = DEFAULT_LOCALE) {
  const { payment, order } = await loadPaymentByToken(token);

  if (payment.provider === 'arca' && payment.status === 'pending' && payment.providerOrderId) {
    const throttled = payment.lastCheckedAt !== undefined && Date.now() - payment.lastCheckedAt.getTime() < POLL_THROTTLE_MS;
    if (!throttled) {
      await refreshArcaStatus(payment, locale);
    }
  }

  const fresh = (await Payment.findById(payment._id)) as PaymentDocument;
  const freshOrder = (await Order.findById(payment.order)) as OrderDocument;
  return { payment: paymentPublic(fresh), order: orderPublic(freshOrder) };
}

async function refreshArcaStatus(payment: PaymentDocument, locale: Locale) {
  await Payment.updateOne({ _id: payment._id }, { $set: { lastCheckedAt: new Date() } });
  try {
    const result = await getOrderStatusExtended(payment.providerOrderId as string, locale);
    if (result.orderStatus === 2) {
      if (result.amount !== undefined && result.amount !== toMinorUnits(payment.amount)) {
        // The gateway answered about a different sum than the one this order
        // registered: never mark it paid on a mismatch.
        await Payment.updateOne(
          { _id: payment._id },
          { $set: { lastError: `ArCa reported amount ${result.amount} for a ${toMinorUnits(payment.amount)} order` } },
        );
        return;
      }
      await markPaymentPaid(payment);
      return;
    }
    if (result.orderStatus === 6) return markPaymentTerminal(payment, 'failed', 'ArCa declined the payment');
    if (result.orderStatus === 3) return markPaymentTerminal(payment, 'cancelled', 'ArCa reversed the payment');
    if (result.orderStatus === 4) return markPaymentTerminal(payment, 'refunded', 'ArCa refunded the payment');
    // 0/1/5: registered, pre-authorized or 3-D Secure in progress - still pending.
  } catch (error) {
    await Payment.updateOne(
      { _id: payment._id },
      { $set: { lastError: `ArCa status check failed: ${(error as Error).message}`.slice(0, 400) } },
    );
  }
}

/**
 * The single door to 'paid'. Guarded so repeated confirmations, replays and
 * racing checks settle once; the order mirror follows with its own guard.
 */
async function markPaymentPaid(
  payment: PaymentDocument,
  facts: { payerAccount?: string; providerTxnId?: string; transDate?: string } = {},
): Promise<void> {
  let updated: PaymentDocument | null = null;
  try {
    updated = await Payment.findOneAndUpdate(
      { _id: payment._id, status: { $ne: 'paid' } },
      {
        $set: {
          status: 'paid',
          paidAt: new Date(),
          ...(facts.payerAccount ? { payerAccount: facts.payerAccount } : {}),
          ...(facts.providerTxnId ? { providerTxnId: facts.providerTxnId } : {}),
          ...(facts.transDate ? { transDate: facts.transDate } : {}),
        },
      },
      { new: true },
    );
  } catch {
    // Unique providerTxnId: this transaction id is already recorded elsewhere.
    return;
  }
  if (updated) {
    await Order.updateOne(
      { _id: payment.order, paymentStatus: { $ne: 'paid' } },
      { $set: { paymentStatus: 'paid', paidAt: new Date() } },
    );
  }
}

/** Guarded terminal moves; a paid payment never moves back to pending. */
async function markPaymentTerminal(payment: PaymentDocument, status: 'failed' | 'cancelled' | 'refunded', reason: string) {
  const from: PaymentDocument['status'][] = status === 'refunded' ? ['paid'] : ['pending'];
  const updated = await Payment.findOneAndUpdate(
    { _id: payment._id, status: { $in: from } },
    { $set: { status, lastError: reason } },
    { new: true },
  );
  if (!updated) return;
  const orderFrom: PaymentDocument['status'][] = status === 'refunded' ? ['paid'] : ['pending'];
  await Order.updateOne(
    { _id: payment.order, paymentStatus: { $in: orderFrom } },
    { $set: { paymentStatus: status } },
  );
}

export interface IdramResultBody {
  [key: string]: unknown;
}

/**
 * Idram server-to-server RESULT_URL handler. Responds with the exact literal
 * "OK" (no HTML) or "ERROR"; Idram blocks the charge when OK is missing, so
 * every validation failure must answer ERROR.
 */
export async function handleIdramResult(body: IdramResultBody): Promise<'OK' | 'ERROR'> {
  const cfg = env.payments.idram;
  if (!cfg.enabled) return 'ERROR';

  const billNo = String(body.EDP_BILL_NO ?? '');
  if (!billNo) return 'ERROR';
  if (String(body.EDP_REC_ACCOUNT ?? '') !== cfg.recAccount) return 'ERROR';

  const payment = await Payment.findOne({ providerRef: billNo, provider: 'idram' });
  if (!payment) return 'ERROR';
  const order = await Order.findById(payment.order);
  if (!order) return 'ERROR';

  if (isIdramPrecheck(body)) {
    if (Number(body.EDP_AMOUNT) !== payment.amount) return 'ERROR';
    // A bill that already settled (or a cancelled order) must not be chargeable again.
    if (payment.status === 'paid' || order.status === 'cancelled') return 'ERROR';
    return 'OK';
  }

  if (!idramChecksumMatches(body)) return 'ERROR';
  if (Number(body.EDP_AMOUNT) !== payment.amount) return 'ERROR';

  // Duplicate RESULT for a bill that already settled: acknowledge so Idram stops retrying.
  if (payment.status === 'paid') return 'OK';
  // A cancelled order must not capture payment (mirrors the precheck guard below).
  if (order.status === 'cancelled') return 'ERROR';

  await markPaymentPaid(payment, {
    payerAccount: String(body.EDP_PAYER_ACCOUNT ?? '') || undefined,
    providerTxnId: String(body.EDP_TRANS_ID ?? '') || undefined,
    transDate: String(body.EDP_TRANS_DATE ?? '') || undefined,
  });
  return 'OK';
}
