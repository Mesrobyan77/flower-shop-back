import { Schema, model, type Document, type Types } from 'mongoose';
import { baseToJSON, localizedSchema, type Localized } from './common';

export interface HeroSlide {
  image: string;
  mobileImage?: string;
  title?: Localized;
  subtitle?: Localized;
  ctaLabel?: Localized;
  href?: string;
  theme: 'light' | 'dark';
  order: number;
}

export interface ThemeTile {
  image?: string;
  title: Localized;
  subtitle?: Localized;
  href: string;
  animated: boolean;
  order: number;
}

/** Single-document store for storefront chrome the admin can edit. */
export interface SettingDocument extends Document {
  _id: Types.ObjectId;
  key: string;
  promoBar: { enabled: boolean; text?: Localized; href?: string };
  heroSlides: HeroSlide[];
  themeTiles: ThemeTile[];
  counters: { reviews: number; deliveries: number; awardYears: number };
  contact: { phone: string; overseasPhone?: string; email: string; hours?: Localized; address?: Localized };
  social: { instagram?: string; facebook?: string; youtube?: string; telegram?: string };
  updatedAt: Date;
}

const heroSlideSchema = new Schema<HeroSlide>(
  {
    image: { type: String, required: true },
    mobileImage: { type: String },
    title: { type: localizedSchema(false) },
    subtitle: { type: localizedSchema(false) },
    ctaLabel: { type: localizedSchema(false) },
    href: { type: String },
    theme: { type: String, enum: ['light', 'dark'], default: 'dark' },
    order: { type: Number, default: 0 },
  },
  { _id: false },
);

const themeTileSchema = new Schema<ThemeTile>(
  {
    image: { type: String },
    title: { type: localizedSchema(), required: true },
    subtitle: { type: localizedSchema(false) },
    href: { type: String, required: true },
    animated: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { _id: false },
);

const settingSchema = new Schema<SettingDocument>(
  {
    key: { type: String, required: true, unique: true, default: 'storefront' },
    promoBar: {
      enabled: { type: Boolean, default: false },
      text: { type: localizedSchema(false) },
      href: { type: String },
    },
    heroSlides: { type: [heroSlideSchema], default: [] },
    themeTiles: { type: [themeTileSchema], default: [] },
    counters: {
      reviews: { type: Number, default: 0 },
      deliveries: { type: Number, default: 0 },
      awardYears: { type: Number, default: 0 },
    },
    contact: {
      phone: { type: String, default: '' },
      overseasPhone: { type: String },
      email: { type: String, default: '' },
      hours: { type: localizedSchema(false) },
      address: { type: localizedSchema(false) },
    },
    social: {
      instagram: { type: String },
      facebook: { type: String },
      youtube: { type: String },
      telegram: { type: String },
    },
  },
  { timestamps: true, toJSON: baseToJSON, toObject: baseToJSON },
);

export const Setting = model<SettingDocument>('Setting', settingSchema);
