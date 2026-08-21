import { Schema, model, type Document, type Types } from 'mongoose';
import { baseToJSON } from './common';

/** Binary lives in MinIO; Mongo keeps only the object key and metadata. */
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
  uploadedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

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
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: baseToJSON, toObject: baseToJSON },
);

mediaSchema.index({ createdAt: -1 });

export const Media = model<MediaDocument>('Media', mediaSchema);
