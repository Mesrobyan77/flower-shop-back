import { z } from 'zod';
import { DELIVERY_METHODS, ORDER_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES, REGION_KEYS, TIME_SLOTS } from '../constants';
import { objectId, phone } from './common.validator';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the YYYY-MM-DD format');

export const addToCartSchema = z.object({
  productId: objectId,
  quantity: z.number().int().min(1).max(99).default(1),
  options: z
    .array(z.object({ groupKey: z.string().min(1), optionKey: z.string().optional(), value: z.string().max(500).optional() }))
    .default([]),
  deliveryMethod: z.enum(DELIVERY_METHODS),
  deliveryDate: isoDate.optional(),
  timeSlot: z.enum(TIME_SLOTS as [string, ...string[]]).optional(),
  ribbonText: z.string().max(120).optional(),
  senderName: z.string().max(80).optional(),
  cardMessage: z.string().max(500).optional(),
});

export const updateCartItemSchema = z.object({
  quantity: z.number().int().min(1).max(99).optional(),
  deliveryDate: isoDate.optional(),
  timeSlot: z.enum(TIME_SLOTS as [string, ...string[]]).optional(),
  ribbonText: z.string().max(120).optional(),
  senderName: z.string().max(80).optional(),
  cardMessage: z.string().max(500).optional(),
});

export const cartItemParam = z.object({ itemId: objectId });

export const checkoutSchema = z.object({
  customer: z.object({
    name: z.string().min(2, 'Name is too short').max(80),
    email: z.string().email('Enter a valid email address'),
    phone,
  }),
  delivery: z.object({
    method: z.enum(DELIVERY_METHODS),
    recipient: z.string().min(2, 'Recipient name is required').max(80),
    phone,
    region: z.enum(REGION_KEYS as unknown as [string, ...string[]]),
    city: z.string().min(1, 'City is required').max(80),
    street: z.string().min(1, 'Street is required').max(160),
    building: z.string().max(40).optional(),
    apartment: z.string().max(40).optional(),
    postalCode: z.string().max(16).optional(),
    notes: z.string().max(400).optional(),
    requestedDate: isoDate.optional(),
    timeSlot: z.enum(TIME_SLOTS as [string, ...string[]]).optional(),
  }),
  customerNote: z.string().max(600).optional(),
  pointsUsed: z.number().int().min(0).optional().default(0),
  paymentMethod: z.enum(PAYMENT_METHODS).default('cash_on_delivery'),
  agreeTerms: z.literal(true, { errorMap: () => ({ message: 'You must accept the terms' }) }),
});

export const guestLookupSchema = z.object({
  code: z.string().min(4, 'Order number is required').max(40),
  email: z.string().email('Enter a valid email address'),
});

export const orderListQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(60).optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  q: z.string().max(120).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const changeStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  note: z.string().max(300).optional(),
});

export const changePaymentStatusSchema = z.object({ paymentStatus: z.enum(PAYMENT_STATUSES) });

export const updateOrderNoteSchema = z.object({ adminNote: z.string().max(600) });

export const cancelOrderSchema = z.object({ reason: z.string().max(300).optional() });

export const deliveryQuoteQuery = z.object({
  method: z.enum(DELIVERY_METHODS),
  region: z.enum(REGION_KEYS as unknown as [string, ...string[]]),
  subtotal: z.coerce.number().min(0).default(0),
});

export const addressSchema = z.object({
  label: z.string().max(40).optional(),
  recipient: z.string().min(2).max(80),
  phone,
  region: z.enum(REGION_KEYS as unknown as [string, ...string[]]),
  city: z.string().min(1).max(80),
  street: z.string().min(1).max(160),
  building: z.string().max(40).optional(),
  apartment: z.string().max(40).optional(),
  postalCode: z.string().max(16).optional(),
  notes: z.string().max(300).optional(),
  isDefault: z.boolean().optional().default(false),
});
