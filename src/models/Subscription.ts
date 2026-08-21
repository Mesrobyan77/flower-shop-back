import { Schema, model, type Document, type Types } from 'mongoose';
import {
  REGION_KEYS,
  SUBSCRIPTION_CYCLES,
  SUBSCRIPTION_STATUSES,
  type RegionKey,
  type SubscriptionCycle,
  type SubscriptionStatus,
} from '../constants';
import { baseToJSON, localizedSchema, type Localized } from './common';

export interface SubscriptionPlanDocument extends Document {
  _id: Types.ObjectId;
  slug: string;
  name: Localized;
  description?: Localized;
  image?: string;
  pricePerDelivery: number;
  cycle: SubscriptionCycle;
  minCycles: number;
  isActive: boolean;
  order: number;
}

const planSchema = new Schema<SubscriptionPlanDocument>(
  {
    slug: { type: String, required: true, unique: true, lowercase: true },
    name: { type: localizedSchema(), required: true },
    description: { type: localizedSchema(false) },
    image: { type: String },
    pricePerDelivery: { type: Number, required: true, min: 0 },
    cycle: { type: String, enum: SUBSCRIPTION_CYCLES, default: 'monthly' },
    minCycles: { type: Number, default: 1, min: 1 },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true, toJSON: baseToJSON, toObject: baseToJSON },
);

export const SubscriptionPlan = model<SubscriptionPlanDocument>('SubscriptionPlan', planSchema);

export interface SubscriptionDocument extends Document {
  _id: Types.ObjectId;
  code: string;
  user: Types.ObjectId;
  plan: Types.ObjectId;
  cycle: SubscriptionCycle;
  status: SubscriptionStatus;
  pricePerDelivery: number;
  deliveriesDone: number;
  nextDeliveryAt?: Date;
  startedAt: Date;
  pausedAt?: Date;
  cancelledAt?: Date;
  recipient: string;
  phone: string;
  region: RegionKey;
  city: string;
  street: string;
  building?: string;
  apartment?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const subscriptionSchema = new Schema<SubscriptionDocument>(
  {
    code: { type: String, required: true, unique: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    plan: { type: Schema.Types.ObjectId, ref: 'SubscriptionPlan', required: true },
    cycle: { type: String, enum: SUBSCRIPTION_CYCLES, required: true },
    status: { type: String, enum: SUBSCRIPTION_STATUSES, default: 'active', index: true },
    pricePerDelivery: { type: Number, required: true, min: 0 },
    deliveriesDone: { type: Number, default: 0 },
    nextDeliveryAt: { type: Date, index: true },
    startedAt: { type: Date, default: Date.now },
    pausedAt: { type: Date },
    cancelledAt: { type: Date },
    recipient: { type: String, required: true },
    phone: { type: String, required: true },
    region: { type: String, enum: REGION_KEYS, required: true },
    city: { type: String, required: true },
    street: { type: String, required: true },
    building: { type: String },
    apartment: { type: String },
    notes: { type: String, maxlength: 400 },
  },
  { timestamps: true, toJSON: baseToJSON, toObject: baseToJSON },
);

export const Subscription = model<SubscriptionDocument>('Subscription', subscriptionSchema);
