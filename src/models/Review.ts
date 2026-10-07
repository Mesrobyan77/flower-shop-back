import { Schema, model, type Document, type Types } from 'mongoose';
import { baseToJSON } from './common';

export interface ReviewDocument extends Document {
  _id: Types.ObjectId;
  product: Types.ObjectId;
  user: Types.ObjectId;
  order?: Types.ObjectId;
  rating: number;
  title?: string;
  body: string;
  images: string[];
  isVerified: boolean;
  isApproved: boolean;
  helpfulCount: number;
  helpfulBy: Types.ObjectId[];
  adminReply?: { body: string; repliedAt: Date; repliedBy: Types.ObjectId };
  createdAt: Date;
  updatedAt: Date;
}

const reviewSchema = new Schema<ReviewDocument>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    order: { type: Schema.Types.ObjectId, ref: 'Order' },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, trim: true, maxlength: 120 },
    body: { type: String, required: true, trim: true, maxlength: 3000 },
    images: [{ type: String }],
    isVerified: { type: Boolean, default: false },
    isApproved: { type: Boolean, default: true, index: true },
    helpfulCount: { type: Number, default: 0 },
    /**
     * Who has already voted this review helpful, so a second click by the same
     * account is a no-op instead of another increment. Never sent to a client -
     * a voter's identity is their own business.
     */
    helpfulBy: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [], select: false },
    adminReply: {
      body: { type: String },
      repliedAt: { type: Date },
      repliedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    },
  },
  { timestamps: true, toJSON: baseToJSON, toObject: baseToJSON },
);

reviewSchema.index({ product: 1, createdAt: -1 });
reviewSchema.index({ user: 1, product: 1, order: 1 }, { unique: true, sparse: true });

export const Review = model<ReviewDocument>('Review', reviewSchema);
