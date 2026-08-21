import { Schema, model, type Document, type Types } from 'mongoose';
import { DELIVERY_METHODS, type DeliveryMethod } from '../constants';
import { baseToJSON } from './common';

export interface SelectedOption {
  groupKey: string;
  groupLabel: string;
  optionKey?: string;
  value: string;
  priceDelta: number;
}

export interface CartItemSubdoc extends Types.Subdocument<Types.ObjectId> {
  _id: Types.ObjectId;
  product: Types.ObjectId;
  quantity: number;
  unitPrice: number;
  options: SelectedOption[];
  deliveryMethod: DeliveryMethod;
  deliveryDate?: Date;
  timeSlot?: string;
  ribbonText?: string;
  senderName?: string;
  cardMessage?: string;
  addedAt: Date;
}

export interface CartDocument extends Document {
  _id: Types.ObjectId;
  user?: Types.ObjectId;
  sessionId?: string;
  items: Types.DocumentArray<CartItemSubdoc>;
  createdAt: Date;
  updatedAt: Date;
}

export const selectedOptionSchema = new Schema<SelectedOption>(
  {
    groupKey: { type: String, required: true },
    groupLabel: { type: String, default: '' },
    optionKey: { type: String },
    value: { type: String, default: '' },
    priceDelta: { type: Number, default: 0 },
  },
  { _id: false },
);

const cartItemSchema = new Schema<CartItemSubdoc>({
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true, min: 1, max: 99 },
  unitPrice: { type: Number, required: true, min: 0 },
  options: { type: [selectedOptionSchema], default: [] },
  deliveryMethod: { type: String, enum: DELIVERY_METHODS, default: 'quick' },
  deliveryDate: { type: Date },
  timeSlot: { type: String },
  ribbonText: { type: String, maxlength: 120 },
  senderName: { type: String, maxlength: 80 },
  cardMessage: { type: String, maxlength: 500 },
  addedAt: { type: Date, default: Date.now },
});

const cartSchema = new Schema<CartDocument>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', index: true, sparse: true },
    sessionId: { type: String, index: true, sparse: true },
    items: { type: [cartItemSchema], default: [] },
  },
  { timestamps: true, toJSON: baseToJSON, toObject: baseToJSON },
);

/** Guest carts expire after 30 days of inactivity; member carts persist. */
cartSchema.index(
  { updatedAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 30, partialFilterExpression: { user: { $exists: false } } },
);

export const Cart = model<CartDocument>('Cart', cartSchema);
