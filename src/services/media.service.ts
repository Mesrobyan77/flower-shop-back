import path from 'path';
import type { UploadApiResponse } from 'cloudinary';
import { cloudinary, ensureCloudinary, scopedFolder } from '../config/cloudinary';
import { Media, type MediaDocument } from '../models/Media';
import { ApiError } from '../utils/ApiError';
import { randomToken } from '../utils/codes';
import { slugify } from '../utils/slug';

export interface UploadInput {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  size: number;
  folder?: string;
  alt?: string;
  uploadedBy?: string;
}

/**
 * Cloudinary public ids carry no extension - the delivery URL appends it.
 * Keeping the yyyymm segment makes the media library browsable by upload month.
 */
function buildPublicId(originalName: string): string {
  const ext = path.extname(originalName);
  const base = slugify(path.basename(originalName, ext)) || 'file';
  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return `${yyyymm}/${base}-${randomToken(6)}`;
}

function uploadBuffer(buffer: Buffer, folder: string, publicId: string): Promise<UploadApiResponse> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: 'image',
        overwrite: false,
      },
      (err, result) => {
        if (err || !result) reject(err ?? new Error('Cloudinary returned no result'));
        else resolve(result);
      },
    );
    stream.end(buffer);
  });
}

/**
 * Delivery URL. `f_auto` / `q_auto` let Cloudinary re-encode to webp or avif per
 * browser, and an optional width caps the transfer - one upload serves every
 * breakpoint, so no resizing happens on our side.
 */
export function deliveryUrl(key: string, width?: number): string {
  const transformation: Record<string, unknown>[] = [];
  if (width) transformation.push({ width, crop: 'limit' });
  transformation.push({ quality: 'auto', fetch_format: 'auto' });
  return cloudinary.url(key, { secure: true, transformation });
}

export async function uploadMedia(input: UploadInput): Promise<MediaDocument> {
  if (!ensureCloudinary()) throw ApiError.internal('Media storage is not configured, please try again later');

  const folder = slugify(input.folder ?? 'misc') || 'misc';
  const result = await uploadBuffer(input.buffer, scopedFolder(folder), buildPublicId(input.originalName));

  return Media.create({
    key: result.public_id,
    url: deliveryUrl(result.public_id),
    originalName: input.originalName,
    mimeType: input.mimeType,
    size: result.bytes ?? input.size,
    width: result.width,
    height: result.height,
    folder,
    alt: input.alt,
    uploadedBy: input.uploadedBy,
  });
}

export async function deleteMedia(id: string): Promise<void> {
  const media = await Media.findById(id);
  if (!media) throw ApiError.notFound('Media not found');

  try {
    await cloudinary.uploader.destroy(media.key, { resource_type: 'image', invalidate: true });
  } catch {
    // The DB row is still removed: a stale asset is preferable to a dangling reference.
  }

  await media.deleteOne();
}
