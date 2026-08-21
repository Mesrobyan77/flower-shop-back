import { Schema, model, type Document, type Types } from 'mongoose';
import { baseToJSON, localizedSchema, type Localized } from './common';

export interface CategoryDocument extends Document {
  _id: Types.ObjectId;
  code: string;
  slug: string;
  name: Localized;
  description?: Localized;
  parent?: Types.ObjectId | null;
  ancestors: Types.ObjectId[];
  depth: number;
  image?: string;
  icon?: string;
  order: number;
  isActive: boolean;
  showInNav: boolean;
  productCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const categorySchema = new Schema<CategoryDocument>(
  {
    code: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    name: { type: localizedSchema(), required: true },
    description: { type: localizedSchema(false) },
    parent: { type: Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
    ancestors: [{ type: Schema.Types.ObjectId, ref: 'Category' }],
    depth: { type: Number, default: 0, min: 0 },
    image: { type: String },
    icon: { type: String },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
    showInNav: { type: Boolean, default: true },
    productCount: { type: Number, default: 0 },
  },
  { timestamps: true, toJSON: baseToJSON, toObject: baseToJSON },
);

categorySchema.index({ parent: 1, order: 1 });
categorySchema.index({ isActive: 1, showInNav: 1, order: 1 });

export const Category = model<CategoryDocument>('Category', categorySchema);
