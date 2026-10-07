import path from 'path';
import type { UploadApiResponse } from 'cloudinary';
import { cloudinary, deliveryUrl, ensureCloudinary, scopedFolder } from '../config/cloudinary';
import { Media, type MediaDocument } from '../models/Media';
import { ApiError } from '../utils/ApiError';
import { randomToken } from '../utils/codes';
import { bufferMatchesMimeType } from '../utils/imageType';
import { svgRejectedReason } from '../utils/svg';
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
 * A storage-side rejection is a rejected upload, not an unexplained 500: it keeps
 * the reason in the server log and carries a stable code the admin UI can localize.
 */
function uploadRejected(reason: string, status = 400): ApiError {
  return new ApiError(status, `Upload rejected: ${reason}`, undefined, 'UPLOAD_FAILED');
}

export async function uploadMedia(input: UploadInput): Promise<MediaDocument> {
  /**
   * The multipart part header is client-supplied, so the bytes are checked against
   * it before anything leaves the process. Cheap, and it keeps non-image payloads
   * out of the media library.
   */
  if (!bufferMatchesMimeType(input.buffer, input.mimeType)) {
    throw ApiError.badRequest('The uploaded file does not look like the image type it declares');
  }

  /**
   * An SVG the byte sniff accepted is still only as safe as its markup, and the
   * delivered asset opens in a top-level tab. Executable constructs are refused
   * here rather than stored and served from the media host.
   */
  if (input.mimeType === 'image/svg+xml') {
    const reason = svgRejectedReason(input.buffer);
    if (reason) throw ApiError.badRequest(`The SVG was refused because ${reason}`);
  }

  if (!ensureCloudinary()) throw uploadRejected('media storage is not configured on this server', 503);

  const folder = slugify(input.folder ?? 'misc') || 'misc';
  const publicId = buildPublicId(input.originalName);

  let result: UploadApiResponse;
  try {
    result = await uploadBuffer(input.buffer, scopedFolder(folder), publicId);
  } catch (err) {
    throw uploadRejected(err instanceof Error ? err.message : 'the image storage did not accept the file');
  }

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
