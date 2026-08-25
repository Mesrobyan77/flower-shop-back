import { v2 as cloudinary } from 'cloudinary';
import { env } from './env';
import { logger } from './logger';

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
});

export { cloudinary };

/**
 * Credentials are optional so the API still boots without them - the storefront
 * runs fine on the seeded local artwork. Uploads then fail loudly instead.
 */
export function isCloudinaryConfigured(): boolean {
  return Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
}

let announced = false;

export function ensureCloudinary(): boolean {
  const configured = isCloudinaryConfigured();
  if (!announced) {
    announced = true;
    if (configured) logger.info('Cloudinary ready', { cloud: env.CLOUDINARY_CLOUD_NAME });
    else logger.warn('Cloudinary is not configured - media uploads will fail until CLOUDINARY_* is set');
  }
  return configured;
}

/** Prefix every asset with the project folder so one cloud can host several sites. */
export function scopedFolder(folder: string): string {
  const root = env.CLOUDINARY_FOLDER.replace(/^\/+|\/+$/g, '');
  return root ? `${root}/${folder}` : folder;
}
