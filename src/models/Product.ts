import { Schema, model, type Document, type Types } from 'mongoose';
import { DELIVERY_METHODS, PRODUCT_BADGES, type DeliveryMethod, type ProductBadge } from '../constants';
import { baseToJSON, localizedSchema, type Localized } from './common';

export interface ProductOption {
  key: string;
  label: Localized;
  priceDelta: number;
  isAvailable: boolean;
  order: number;
}

export interface ProductOptionGroup {
  key: string;
  label: Localized;
  helpText?: Localized;
  type: 'select' | 'text' | 'textarea' | 'date' | 'time';
  required: boolean;
  maxLength?: number;
  order: number;
  options: ProductOption[];
}

export interface ProductImage {
  url: string;
  alt?: string;
  order: number;
  /** Cloudinary public id of our hosted copy; the url is its delivery URL. */
  publicId?: string;
  mediaId?: Types.ObjectId;
}

export interface ProductDocument extends Document {
  _id: Types.ObjectId;
  sku: string;
  slug: string;
  name: Localized;
  shortDescription?: Localized;
  description?: Localized;
  careGuide?: Localized;
  category: Types.ObjectId;
  categoryPath: Types.ObjectId[];
  price: number;
  compareAtPrice?: number;
  cost?: number;
  images: ProductImage[];
  thumbnail?: string;
  optionGroups: ProductOptionGroup[];
  deliveryMethods: DeliveryMethod[];
  quickOnlyRegions: string[];
  badges: ProductBadge[];
  origin?: Localized;
  composition?: Localized;
  size?: Localized;
  stock: number;
  trackStock: boolean;
  isActive: boolean;
  isFeatured: boolean;
  sameDayAvailable: boolean;
  minOrderQty: number;
  maxOrderQty: number;
  ratingAverage: number;
  ratingCount: number;
  soldCount: number;
  viewCount: number;
  wishlistCount: number;
  order: number;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const optionSchema = new Schema<ProductOption>(
  {
    key: { type: String, required: true },
    label: { type: localizedSchema(), required: true },
    priceDelta: { type: Number, default: 0 },
    isAvailable: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { _id: false },
);

const optionGroupSchema = new Schema<ProductOptionGroup>(
  {
    key: { type: String, required: true },
    label: { type: localizedSchema(), required: true },
    helpText: { type: localizedSchema(false) },
    type: { type: String, enum: ['select', 'text', 'textarea', 'date', 'time'], default: 'select' },
    required: { type: Boolean, default: false },
    maxLength: { type: Number },
    order: { type: Number, default: 0 },
    options: { type: [optionSchema], default: [] },
  },
  { _id: false },
);

const imageSchema = new Schema<ProductImage>(
  {
    url: { type: String, required: true },
    alt: { type: String },
    order: { type: Number, default: 0 },
    publicId: { type: String },
    mediaId: { type: Schema.Types.ObjectId, ref: 'Media' },
  },
  { _id: false },
);

const productSchema = new Schema<ProductDocument>(
  {
    sku: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    name: { type: localizedSchema(), required: true },
    shortDescription: { type: localizedSchema(false) },
    description: { type: localizedSchema(false) },
    careGuide: { type: localizedSchema(false) },
    category: { type: Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    categoryPath: [{ type: Schema.Types.ObjectId, ref: 'Category', index: true }],
    price: { type: Number, required: true, min: 0 },
    compareAtPrice: { type: Number, min: 0 },
    cost: { type: Number, min: 0 },
    images: { type: [imageSchema], default: [] },
    thumbnail: { type: String },
    optionGroups: { type: [optionGroupSchema], default: [] },
    deliveryMethods: [{ type: String, enum: DELIVERY_METHODS }],
    quickOnlyRegions: [{ type: String }],
    badges: [{ type: String, enum: PRODUCT_BADGES }],
    origin: { type: localizedSchema(false) },
    composition: { type: localizedSchema(false) },
    size: { type: localizedSchema(false) },
    stock: { type: Number, default: 0, min: 0 },
    trackStock: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
    isFeatured: { type: Boolean, default: false, index: true },
    sameDayAvailable: { type: Boolean, default: true },
    minOrderQty: { type: Number, default: 1, min: 1 },
    maxOrderQty: { type: Number, default: 20, min: 1 },
    ratingAverage: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },
    soldCount: { type: Number, default: 0, min: 0 },
    viewCount: { type: Number, default: 0, min: 0 },
    wishlistCount: { type: Number, default: 0, min: 0 },
    order: { type: Number, default: 0 },
    publishedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, toJSON: baseToJSON, toObject: baseToJSON },
);

productSchema.index({ isActive: 1, category: 1, order: 1 });
productSchema.index({ isActive: 1, price: 1 });
productSchema.index({ isActive: 1, createdAt: -1 });
productSchema.index({ isActive: 1, soldCount: -1 });
productSchema.index({ 'name.hy': 'text', 'name.en': 'text', 'name.ru': 'text', sku: 'text' });

productSchema.virtual('inStock').get(function inStock(this: ProductDocument) {
  return !this.trackStock || this.stock > 0;
});

export const Product = model<ProductDocument>('Product', productSchema);
