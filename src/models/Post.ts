import { Schema, model, type Document, type Types } from 'mongoose';
import { POST_TYPES, type PostType } from '../constants';
import { baseToJSON, localizedSchema, type Localized } from './common';

/** Magazine, notices, FAQ and events all lived on the same board engine. */
export interface PostDocument extends Document {
  _id: Types.ObjectId;
  type: PostType;
  slug: string;
  title: Localized;
  excerpt?: Localized;
  body: Localized;
  coverImage?: string;
  tags: string[];
  category?: string;
  isPublished: boolean;
  isPinned: boolean;
  viewCount: number;
  publishedAt?: Date;
  startsAt?: Date;
  endsAt?: Date;
  author?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const postSchema = new Schema<PostDocument>(
  {
    type: { type: String, enum: POST_TYPES, required: true, index: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    title: { type: localizedSchema(), required: true },
    excerpt: { type: localizedSchema(false) },
    body: { type: localizedSchema(), required: true },
    coverImage: { type: String },
    tags: [{ type: String, trim: true }],
    category: { type: String, trim: true },
    isPublished: { type: Boolean, default: true, index: true },
    isPinned: { type: Boolean, default: false },
    viewCount: { type: Number, default: 0 },
    publishedAt: { type: Date, default: Date.now },
    startsAt: { type: Date },
    endsAt: { type: Date },
    author: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: baseToJSON, toObject: baseToJSON },
);

postSchema.index({ type: 1, isPublished: 1, isPinned: -1, publishedAt: -1 });

export const Post = model<PostDocument>('Post', postSchema);
