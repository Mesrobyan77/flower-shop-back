import { Schema, model, type Document, type Types } from 'mongoose';
import { baseToJSON } from './common';

/** Reference had per-product Q&A (상품문의) plus a general 1:1 channel. */
export interface InquiryDocument extends Document {
  _id: Types.ObjectId;
  product?: Types.ObjectId;
  user: Types.ObjectId;
  topic: 'product' | 'order' | 'delivery' | 'general';
  subject: string;
  body: string;
  isSecret: boolean;
  status: 'open' | 'answered' | 'closed';
  answer?: { body: string; answeredAt: Date; answeredBy: Types.ObjectId };
  createdAt: Date;
  updatedAt: Date;
}

const inquirySchema = new Schema<InquiryDocument>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    topic: { type: String, enum: ['product', 'order', 'delivery', 'general'], default: 'general' },
    subject: { type: String, required: true, trim: true, maxlength: 160 },
    body: { type: String, required: true, trim: true, maxlength: 3000 },
    isSecret: { type: Boolean, default: false },
    status: { type: String, enum: ['open', 'answered', 'closed'], default: 'open', index: true },
    answer: {
      body: { type: String },
      answeredAt: { type: Date },
      answeredBy: { type: Schema.Types.ObjectId, ref: 'User' },
    },
  },
  { timestamps: true, toJSON: baseToJSON, toObject: baseToJSON },
);

inquirySchema.index({ createdAt: -1 });

export const Inquiry = model<InquiryDocument>('Inquiry', inquirySchema);
