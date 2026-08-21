import { Schema, model, type Document, type Types } from 'mongoose';
import {
  DELIVERY_METHODS,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  REGION_KEYS,
  type DeliveryMethod,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
  type RegionKey,
} from '../constants';
import { baseToJSON } from './common';
import { selectedOptionSchema, type SelectedOption } from './Cart';

export interface OrderItemSubdoc {
  product: Types.ObjectId;
  name: string;
  sku: string;
  thumbnail?: string;
  unitPrice: number;
  quantity: number;
  options: SelectedOption[];
  optionsTotal: number;
  lineTotal: number;
  ribbonText?: string;
  senderName?: string;
  cardMessage?: string;
}

export interface OrderDelivery {
  method: DeliveryMethod;
  recipient: string;
  phone: string;
  region: RegionKey;
  city: string;
  street: string;
  building?: string;
  apartment?: string;
  postalCode?: string;
  notes?: string;
  requestedDate?: Date;
  timeSlot?: string;
  fee: number;
  surcharge: number;
  deliveredAt?: Date;
}

export interface OrderStatusEntry {
  status: OrderStatus;
  note?: string;
  changedBy?: Types.ObjectId;
  changedAt: Date;
}

export interface OrderDocument extends Document {
  _id: Types.ObjectId;
  code: string;
  user?: Types.ObjectId;
  isGuest: boolean;
  customer: { name: string; email: string; phone: string };
  items: OrderItemSubdoc[];
  delivery: OrderDelivery;
  subtotal: number;
  optionsTotal: number;
  deliveryFee: number;
  gradeDiscount: number;
  pointsUsed: number;
  total: number;
  pointsEarned: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  statusHistory: OrderStatusEntry[];
  customerNote?: string;
  adminNote?: string;
  cancelReason?: string;
  paidAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new Schema<OrderItemSubdoc>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    sku: { type: String, required: true },
    thumbnail: { type: String },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    options: { type: [selectedOptionSchema], default: [] },
    optionsTotal: { type: Number, default: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
    ribbonText: { type: String },
    senderName: { type: String },
    cardMessage: { type: String },
  },
  { _id: false },
);

const deliverySchema = new Schema<OrderDelivery>(
  {
    method: { type: String, enum: DELIVERY_METHODS, required: true },
    recipient: { type: String, required: true },
    phone: { type: String, required: true },
    region: { type: String, enum: REGION_KEYS, required: true },
    city: { type: String, required: true },
    street: { type: String, required: true },
    building: { type: String },
    apartment: { type: String },
    postalCode: { type: String },
    notes: { type: String, maxlength: 400 },
    requestedDate: { type: Date },
    timeSlot: { type: String },
    fee: { type: Number, default: 0 },
    surcharge: { type: Number, default: 0 },
    deliveredAt: { type: Date },
  },
  { _id: false },
);

const statusEntrySchema = new Schema<OrderStatusEntry>(
  {
    status: { type: String, enum: ORDER_STATUSES, required: true },
    note: { type: String },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const orderSchema = new Schema<OrderDocument>(
  {
    code: { type: String, required: true, unique: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    isGuest: { type: Boolean, default: false },
    customer: {
      name: { type: String, required: true },
      email: { type: String, required: true, lowercase: true, index: true },
      phone: { type: String, required: true },
    },
    items: { type: [orderItemSchema], required: true },
    delivery: { type: deliverySchema, required: true },
    subtotal: { type: Number, required: true, min: 0 },
    optionsTotal: { type: Number, default: 0 },
    deliveryFee: { type: Number, default: 0 },
    gradeDiscount: { type: Number, default: 0 },
    pointsUsed: { type: Number, default: 0 },
    total: { type: Number, required: true, min: 0 },
    pointsEarned: { type: Number, default: 0 },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, default: 'cash_on_delivery' },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'pending', index: true },
    status: { type: String, enum: ORDER_STATUSES, default: 'pending', index: true },
    statusHistory: { type: [statusEntrySchema], default: [] },
    customerNote: { type: String, maxlength: 600 },
    adminNote: { type: String, maxlength: 600 },
    cancelReason: { type: String, maxlength: 300 },
    paidAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true, toJSON: baseToJSON, toObject: baseToJSON },
);

orderSchema.index({ createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ 'delivery.requestedDate': 1, status: 1 });

export const Order = model<OrderDocument>('Order', orderSchema);
