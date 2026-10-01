import { Schema, model, type Document, type Types } from 'mongoose';
import { baseToJSON } from './common';

/**
 * Where a seeded asset originally came from. Metadata only: the displayed URL
 * is always our own Cloudinary delivery URL (`sourceUrl` is never rendered).
 */
export interface MediaSource {
  provider: string;
  externalId: string;
  photographer?: string;
  photographerUrl?: string;
  sourceUrl?: string;
  sourceProductUrl?: string;
}

/** Binary lives in Cloudinary; Mongo keeps only the public id and metadata. */
export interface MediaDocument extends Document {
  _id: Types.ObjectId;
  key: string;
  url: string;
  originalName: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  folder: string;
  alt?: string;
  source?: MediaSource;
  uploadedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const sourceSchema = new Schema<MediaSource>(
  {
    provider: { type: String, required: true },
    externalId: { type: String, required: true },
    photographer: { type: String },
    photographerUrl: { type: String },
    sourceUrl: { type: String },
    sourceProductUrl: { type: String },
  },
  { _id: false },
);

const mediaSchema = new Schema<MediaDocument>(
  {
    key: { type: String, required: true, unique: true },
    url: { type: String, required: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    width: { type: Number },
    height: { type: Number },
    folder: { type: String, default: 'misc', index: true },
    alt: { type: String, trim: true, maxlength: 200 },
    source: { type: sourceSchema, default: undefined },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: baseToJSON, toObject: baseToJSON },
);

mediaSchema.index({ createdAt: -1 });

export const Media = model<MediaDocument>('Media', mediaSchema);
