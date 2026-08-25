import { deliveryUrl, scopedFolder } from '../config/cloudinary';
import { env } from '../config/env';

/** Every seed asset is uploaded under this folder inside CLOUDINARY_FOLDER. */
export const SEED_FOLDER = 'seed';

export function seedPublicId(name: string): string {
  return `${scopedFolder(SEED_FOLDER)}/${name}`;
}

/**
 * Seed artwork is addressed by bare name - `bouquet-01`, `cat-roses` - and
 * resolved here, so one env switch moves the whole catalogue between:
 *
 *   local       root-relative path into frontend/public/images/seed
 *   cloudinary  absolute delivery URL, populated by `npm run seed:images`
 *
 * A deployment wants cloudinary: the .jpg photography is deliberately untracked
 * (~55 MB, reproducible from scripts/fetch-seed-photos.mjs), so a fresh clone
 * has no files to serve and every product image would 404.
 */
export function seedImage(name: string): string {
  if (env.SEED_IMAGE_SOURCE === 'cloudinary') return deliveryUrl(seedPublicId(name));
  return `/images/seed/${name}.${env.SEED_IMAGE_EXT}`;
}
