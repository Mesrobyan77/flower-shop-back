import { Schema, model, type Document, type Types } from 'mongoose';
import { REGION_KEYS, type RegionKey } from '../constants';
import { baseToJSON } from './common';

export interface AddressDocument extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  label?: string;
  recipient: string;
  phone: string;
  region: RegionKey;
  city: string;
  street: string;
  building?: string;
  apartment?: string;
  postalCode?: string;
  notes?: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const addressSchema = new Schema<AddressDocument>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    label: { type: String, trim: true, maxlength: 40 },
    recipient: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, required: true, trim: true, maxlength: 32 },
    region: { type: String, enum: REGION_KEYS, required: true },
    city: { type: String, required: true, trim: true, maxlength: 80 },
    street: { type: String, required: true, trim: true, maxlength: 160 },
    building: { type: String, trim: true, maxlength: 40 },
    apartment: { type: String, trim: true, maxlength: 40 },
    postalCode: { type: String, trim: true, maxlength: 16 },
    notes: { type: String, trim: true, maxlength: 300 },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true, toJSON: baseToJSON, toObject: baseToJSON },
);

addressSchema.index({ user: 1, isDefault: -1, updatedAt: -1 });

export const Address = model<AddressDocument>('Address', addressSchema);
