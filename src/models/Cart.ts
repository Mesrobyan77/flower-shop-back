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
    // Ownership is a single field per cart (user XOR sessionId); the uniqueness
    // guarantees live in the explicit partial indexes below, not in field-level
    // options - a plain sparse index cannot express "unique per owner".
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    sessionId: { type: String },
    items: { type: [cartItemSchema], default: [] },
  },
  { timestamps: true, toJSON: baseToJSON, toObject: baseToJSON },
);

/**
 * Ownership uniqueness (checkpoint E6.1): at most ONE cart per member user and
 * ONE cart per guest session, enforced by MongoDB itself so concurrent first
 * touches cannot each insert their own cart.
 *
 * Two separate single-field indexes on purpose:
 *   - a compound `user + sessionId` index would couple the two ownership modes
 *     and change which combinations are legal;
 *   - `$type` (not `$exists: true`) makes the filters type-exact, so documents
 *     where the ownership field is missing OR null are never indexed and can
 *     never collide with each other. Member carts (`ObjectId`) and guest carts
 *     (`String`) stay independent, and legacy/edge documents with null ownership
 *     are left alone by the unique constraint.
 *
 * `getOrCreateCart` relies on these firing as E11000 and recovers by re-reading
 * the winner's cart. Synchronized by `npm run db:indexes`.
 */
cartSchema.index({ user: 1 }, { unique: true, partialFilterExpression: { user: { $type: 'objectId' } } });
cartSchema.index({ sessionId: 1 }, { unique: true, partialFilterExpression: { sessionId: { $type: 'string' } } });

/**
 * Guest carts expire after 30 days of inactivity; member carts persist.
 *
 * The "is a guest cart" test has to be expressible as a partial index filter, and
 * MongoDB refuses `$exists: false` (or `$not`) there - `$exists: true` is the
 * supported direction. A cart carries `sessionId` for exactly as long as it is a
 * guest cart: signing in either clears it (the cart becomes the member's) or the
 * guest cart is merged and removed. So the sessionId is the guest marker, and the
 * TTL index is buildable.
 */
cartSchema.index(
  { updatedAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 30, partialFilterExpression: { sessionId: { $exists: true } } },
);

export const Cart = model<CartDocument>('Cart', cartSchema);
