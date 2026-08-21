import path from 'path';
import { env } from '../config/env';
import { ensureBucket, minioClient, publicUrl } from '../config/minio';
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

function buildKey(folder: string, originalName: string): string {
  const ext = path.extname(originalName).toLowerCase() || '.bin';
  const base = slugify(path.basename(originalName, ext)) || 'file';
  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return `${folder}/${yyyymm}/${base}-${randomToken(6)}${ext}`;
}

export async function uploadMedia(input: UploadInput): Promise<MediaDocument> {
  const available = await ensureBucket();
  if (!available) throw ApiError.internal('Object storage is unavailable, please try again later');

  const folder = slugify(input.folder ?? 'misc') || 'misc';
  const key = buildKey(folder, input.originalName);

  await minioClient.putObject(env.MINIO_BUCKET, key, input.buffer, input.size, {
    'Content-Type': input.mimeType,
    'Cache-Control': 'public, max-age=31536000, immutable',
  });

  return Media.create({
    key,
    url: publicUrl(key),
    originalName: input.originalName,
    mimeType: input.mimeType,
    size: input.size,
    folder,
    alt: input.alt,
    uploadedBy: input.uploadedBy,
  });
}

export async function deleteMedia(id: string): Promise<void> {
  const media = await Media.findById(id);
  if (!media) throw ApiError.notFound('Media not found');

  try {
    await minioClient.removeObject(env.MINIO_BUCKET, media.key);
  } catch {
    // The DB row is still removed: a stale object is preferable to a dangling reference.
  }

  await media.deleteOne();
}

/** Signed URL for private previews, e.g. drafts not yet published. */
export function presignedUrl(key: string, expirySeconds = 300) {
  return minioClient.presignedGetObject(env.MINIO_BUCKET, key, expirySeconds);
}
