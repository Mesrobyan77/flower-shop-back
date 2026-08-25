/* eslint-disable no-console */
/**
 * Pushes the seed photography into Cloudinary.
 *
 * The .jpg artwork under frontend/public/images/seed is deliberately untracked
 * (~55 MB, reproducible from frontend/scripts/fetch-seed-photos.mjs), so a
 * deployed frontend has nothing to serve. This uploads every file once, after
 * which SEED_IMAGE_SOURCE=cloudinary makes the seed emit absolute delivery URLs.
 *
 * Run from the monorepo (it reads the frontend's public folder):
 *   npm run seed:images            upload what is missing
 *   npm run seed:images -- --force re-upload everything
 *   npm run seed:images -- --dir <path>
 */
import fs from 'fs/promises';
import path from 'path';
import { cloudinary, ensureCloudinary } from '../config/cloudinary';
import { seedPublicId } from '../seed/images';

const EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.svg']);

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  if (!ensureCloudinary()) {
    console.error('CLOUDINARY_* is not configured - nothing to upload to.');
    process.exit(1);
  }

  const force = process.argv.includes('--force');
  const dir = path.resolve(arg('--dir') ?? path.join(process.cwd(), '..', 'frontend', 'public', 'images', 'seed'));

  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    console.error(`Cannot read ${dir} - pass --dir if the frontend lives elsewhere.`);
    process.exit(1);
  }

  // One name may exist as both .svg and .jpg; the photograph wins.
  const byName = new Map<string, string>();
  for (const file of entries.sort()) {
    const ext = path.extname(file).toLowerCase();
    if (!EXTENSIONS.has(ext)) continue;
    const name = path.basename(file, ext);
    if (ext === '.svg' && byName.has(name)) continue;
    if (ext !== '.svg' || !byName.has(name)) byName.set(name, file);
  }

  console.log(`${byName.size} images in ${dir}`);

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const [name, file] of byName) {
    const publicId = seedPublicId(name);
    try {
      if (!force) {
        const existing = await cloudinary.api.resource(publicId).catch(() => null);
        if (existing) {
          skipped++;
          continue;
        }
      }
      await cloudinary.uploader.upload(path.join(dir, file), {
        public_id: publicId,
        resource_type: 'image',
        overwrite: force,
        invalidate: force,
      });
      uploaded++;
      if (uploaded % 20 === 0) console.log(`  ${uploaded} uploaded...`);
    } catch (err) {
      failed++;
      console.error(`  FAILED ${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`done - ${uploaded} uploaded, ${skipped} already there, ${failed} failed`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
