import { Schema, model, type Document, type Types } from 'mongoose';
import { baseToJSON, localizedSchema, type Localized } from './common';

/**
 * The reference exposed curated sets under /goods/brand?code=XXXX
 * (famous-painting line, bucket line, planterior, gifts, seasonal picks).
 */
export interface CollectionDocument extends Document {
  _id: Types.ObjectId;
  slug: string;
  title: Localized;
  subtitle?: Localized;
  description?: Localized;
  coverImage?: string;
  bannerImage?: string;
  products: Types.ObjectId[];
  order: number;
  isActive: boolean;
  showOnHome: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const collectionSchema = new Schema<CollectionDocument>(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    title: { type: localizedSchema(), required: true },
    subtitle: { type: localizedSchema(false) },
    description: { type: localizedSchema(false) },
    coverImage: { type: String },
    bannerImage: { type: String },
    products: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
    showOnHome: { type: Boolean, default: false, index: true },
  },
  { timestamps: true, toJSON: baseToJSON, toObject: baseToJSON },
);

collectionSchema.index({ showOnHome: 1, order: 1 });

export const Collection = model<CollectionDocument>('Collection', collectionSchema);
