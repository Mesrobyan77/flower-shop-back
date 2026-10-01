import { Schema, model, type Document, type Types } from 'mongoose';
import { PAYMENT_STATUSES, type PaymentStatus } from '../constants';
import { baseToJSON } from './common';

/**
 * Online-payment attempts (Idram, ArCa). One record per order; retries reuse
 * the same record and only bump `attempts` / rotate `providerRef`, so a
 * double submit can never create two payment records for one order.
 *
 * `status` only ever moves to 'paid' through a server-side verified provider
 * signal (Idram RESULT_URL checksum, ArCa getOrderStatusExtended). Browser
 * redirects are hints, never proof.
 */
export type PaymentProvider = 'idram' | 'arca';
export const PAYMENT_PROVIDERS: PaymentProvider[] = ['idram', 'arca'];

export interface PaymentDocument extends Document {
  _id: Types.ObjectId;
  order: Types.ObjectId;
  provider: PaymentProvider;
  /** Server-derived from the order total; never accepted from the frontend. */
  amount: number;
  currency: string;
  status: PaymentStatus;
  /**
   * Unguessable token embedded in every return URL. It is the only credential
   * a guest has for fetching the authoritative payment state.
   */
  returnToken: string;
  /**
   * EDP_BILL_NO (Idram, stable per order) / orderNumber (ArCa, rotated per
   * registration because EPG refuses a duplicate orderNumber).
   */
  providerRef: string;
  /** ArCa orderId returned by register.do. */
  providerOrderId?: string;
  /** ArCa hosted page. Idram uses a self-submitting form instead. */
  formUrl?: string;
  /** Completed initiations; 1 for the first attempt. */
  attempts: number;
  lastError?: string;
  /** Idram payer account (masked by the provider) recorded on confirmation. */
  payerAccount?: string;
  /** Provider transaction id; unique+sparse so a replayed callback is a no-op. */
  providerTxnId?: string;
  /** Idram EDP_TRANS_DATE verbatim (dd/mm/yyyy). */
  transDate?: string;
  /** 'starting' is a CAS lease so concurrent start calls cannot double-register. */
  checkState: 'idle' | 'starting' | 'ready';
  /** ArCa status poll throttle. */
  lastCheckedAt?: Date;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<PaymentDocument>(
  {
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
    provider: { type: String, enum: PAYMENT_PROVIDERS, required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: 'AMD' },
    status: { type: String, enum: PAYMENT_STATUSES, default: 'pending', index: true },
    returnToken: { type: String, required: true, unique: true },
    providerRef: { type: String, required: true, unique: true },
    providerOrderId: { type: String },
    formUrl: { type: String },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, maxlength: 400 },
    payerAccount: { type: String, maxlength: 64 },
    providerTxnId: { type: String, unique: true, sparse: true },
    transDate: { type: String, maxlength: 20 },
    checkState: { type: String, enum: ['idle', 'starting', 'ready'], default: 'idle' },
    lastCheckedAt: { type: Date },
    paidAt: { type: Date },
  },
  { timestamps: true, toJSON: baseToJSON, toObject: baseToJSON },
);

export const Payment = model<PaymentDocument>('Payment', paymentSchema);
