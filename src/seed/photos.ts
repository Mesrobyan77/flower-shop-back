/* eslint-disable no-console */
/**
 * Seed image pipeline: source bytes -> temporary buffer -> our Cloudinary -> Media.
 *
 * Two byte sources feed the one Cloudinary+Media architecture:
 *  - ThanksFlowers product pages: the primary source for imported products.
 *  - Pexels search: decorative slots and the documented fallback for images
 *    that cannot be obtained from the primary source.
 * Every URL that ends up on a product, post or storefront setting is our own
 * Cloudinary delivery URL; the origin details (photo id / photographer /
 * source page) survive as attribution metadata on Media.source and are never
 * rendered anywhere.
 */
import { createHash } from 'node:crypto';
import type { UploadApiResponse } from 'cloudinary';
import { cloudinary, deliveryUrl, isCloudinaryConfigured, scopedFolder } from '../config/cloudinary';
import { logger } from '../config/logger';
import { Media, type MediaDocument, type MediaSource } from '../models/Media';
import { SEED_FOLDER, seedImage } from './images';

const PEXELS_API = 'https://api.pexels.com/v1/search';
/** Cloudinary hosts every one of our delivery URLs under this origin. */
const OUR_ORIGIN = /^https:\/\/res\.cloudinary\.com\//;
/** ThanksFlowers is the primary byte source for the imported product catalog. */
const TF_ORIGIN = 'https://thanksflowers.am';
const TF_FETCH_TIMEOUT_MS = 20_000;
const TF_MIN_BYTES = 1024;
const TF_MAX_BYTES = 12 * 1024 * 1024;
/** Pexels paginates at 80 per page; three pages per subject is plenty. */
const MAX_PAGES = 3;

type Orientation = 'square' | 'landscape';

interface PexelsPhoto {
  id: number;
  width?: number;
  height?: number;
  url?: string;
  photographer?: string;
  photographer_url?: string;
  src?: { original?: string; large2x?: string; large?: string };
}

interface SlotSpec {
  query: string;
  orientation: Orientation;
}

export interface ResolvedImage {
  /** Our Cloudinary delivery URL - the only URL that may be displayed. */
  url: string;
  /** Cloudinary public id, when the asset went through our pipeline. */
  publicId?: string;
  mediaId?: MediaDocument['_id'];
}

export interface SeedAssetStats {
  searches: number;
  photosDownloaded: number;
  photosUploaded: number;
  assetsReused: number;
  mediaReused: number;
  mediaCreated: number;
  tfDownloaded: number;
  tfUploaded: number;
  tfAssetsReused: number;
  tfMediaReused: number;
  tfMediaCreated: number;
}

/** One product image of a ThanksFlowers page, identified by that page. */
export interface TfImageRef {
  tfSlug: string;
  productUrl: string;
  path: string;
}

export interface SeedAssets {
  /** False when the run fell back to the checked-in local artwork. */
  live: boolean;
  resolve(name: string): Promise<ResolvedImage>;
  /** Imported-product pipeline: source-page image -> our Cloudinary -> Media. */
  resolveTf(ref: TfImageRef): Promise<ResolvedImage>;
  stats(): Readonly<SeedAssetStats>;
  verifyUrl(url: string): Promise<boolean>;
}

export function isOurCloudinaryUrl(url: string): boolean {
  return OUR_ORIGIN.test(url);
}

/* -------------------------------------------------------------------------- */
/* which subject each seed slot should depict                                  */
/* -------------------------------------------------------------------------- */

/**
 * One entry per product artwork family (`SeedProduct.image`). The `-2` / `-3`
 * gallery variants of a name draw from the same pool as the main image.
 */
const PRODUCT_QUERIES: Record<string, string> = {
  'bouquet-01': 'pastel flower bouquet',
  'bouquet-02': 'purple flower bouquet',
  'bouquet-03': 'spray roses bouquet',
  'bouquet-04': 'sunflower bouquet',
  'bouquet-05': 'mixed flower bouquet',
  'bouquet-06': 'romantic flower bouquet',
  'bouquet-07': 'premium flower bouquet',
  'bouquet-08': 'peony bouquet',
  'bouquet-09': 'tulip bouquet',
  'bouquet-10': 'pink lily bouquet',
  'bouquet-11': 'sunflower bouquet',
  'bouquet-12': 'mixed flower bouquet',
  'bouquet-13': 'premium flower bouquet',
  'bouquet-14': 'spring flower bouquet',
  'roses-01': 'red roses bouquet',
  'roses-02': 'pink roses bouquet',
  'basket-01': 'flower basket arrangement',
  'basket-02': 'white lily bouquet',
  'basket-03': 'flower basket arrangement',
  'box-01': 'flowers in a gift box',
  'box-02': 'flowers in a gift box',
  'box-03': 'flowers in a gift box',
  'box-04': 'red roses bouquet',
  'plant-01': 'potted houseplant',
  'plant-02': 'orchid bouquet',
  'plant-03': 'potted houseplant',
  'plant-04': 'potted houseplant',
  'plant-05': 'office plant',
  'wedding-01': 'white roses bouquet',
  'wedding-02': 'wedding bouquet',
  'wreath-01': 'funeral flower wreath',
  'wreath-02': 'funeral flower wreath',
  'gift-01': 'cake and flowers',
  'gift-02': 'chocolate gift flowers',
  'gift-03': 'fruit basket',
  'gift-04': 'fruit basket with flowers',
  'trend-01': 'elegant flower arrangement bouquet',
  'trend-02': 'colorful flower arrangement',
  'trend-03': 'dried flowers bouquet',
  'diy-01': 'red roses bouquet',
  'diy-02': 'tulip bouquet',
  'diy-03': 'eucalyptus branches',
  'diy-04': 'florist wrapping bouquet',
  'diy-05': 'spring flower bouquet',
};

/** Everything that is not a product gallery: categories, collections, chrome. */
const STATIC_SLOTS: Record<string, SlotSpec> = {
  'cat-flower-gifts': { query: 'flower gift bouquet', orientation: 'landscape' },
  'cat-bouquets': { query: 'mixed flower bouquet', orientation: 'landscape' },
  'cat-flower-baskets': { query: 'flower basket arrangement', orientation: 'landscape' },
  'cat-flower-boxes': { query: 'flowers in a gift box', orientation: 'landscape' },
  'cat-roses': { query: 'red roses bouquet', orientation: 'landscape' },
  'cat-opening-plants': { query: 'congratulatory plant pot', orientation: 'landscape' },
  'cat-congratulation-plants': { query: 'orchid plant gift', orientation: 'landscape' },
  'cat-orchids': { query: 'orchid bouquet', orientation: 'landscape' },
  'cat-planterior': { query: 'indoor plants interior', orientation: 'landscape' },
  'cat-promotion': { query: 'elegant flower arrangement', orientation: 'landscape' },
  'cat-promotion-bouquets': { query: 'premium flower bouquet', orientation: 'landscape' },
  'cat-office-plants': { query: 'office plant', orientation: 'landscape' },
  'cat-wedding-funeral': { query: 'white flower arrangement', orientation: 'landscape' },
  'cat-wedding-flowers': { query: 'wedding bouquet', orientation: 'landscape' },
  'cat-funeral-wreaths': { query: 'white funeral flowers', orientation: 'landscape' },
  'cat-trend-pick': { query: 'trendy flower arrangement', orientation: 'landscape' },
  'cat-diy-market': { query: 'flower market stall', orientation: 'landscape' },
  'cat-single-stems': { query: 'single flower stem', orientation: 'landscape' },
  'cat-florist-supplies': { query: 'florist workshop tools', orientation: 'landscape' },
  'cat-flower-types': { query: 'flower bouquet collection', orientation: 'landscape' },
  'cat-tulips': { query: 'tulip bouquet', orientation: 'landscape' },
  'cat-lilies': { query: 'white lily bouquet', orientation: 'landscape' },
  'cat-sunflowers': { query: 'sunflower bouquet', orientation: 'landscape' },
  'cat-mixed-bouquets': { query: 'mixed flower bouquet', orientation: 'landscape' },
  'cat-premium-bouquets': { query: 'premium flower bouquet', orientation: 'landscape' },
  'cat-seasonal-flowers': { query: 'spring flower bouquet', orientation: 'landscape' },

  'collection-florist-picks': { query: 'florist arranging flowers', orientation: 'landscape' },
  'collection-flower-of-the-month': { query: 'seasonal flowers', orientation: 'landscape' },
  'collection-flowers-and-gifts': { query: 'flowers with chocolate gift', orientation: 'landscape' },
  'collection-newborn-gifts': { query: 'pastel baby flowers', orientation: 'landscape' },
  'collection-season-picks': { query: 'colourful seasonal bouquet', orientation: 'landscape' },
  'collection-art-line': { query: 'flower painting still life', orientation: 'landscape' },
  'collection-romantic': { query: 'romantic flower bouquet', orientation: 'landscape' },
  'collection-premium-picks': { query: 'premium flower bouquet', orientation: 'landscape' },
  'collection-birthday': { query: 'birthday flowers bouquet', orientation: 'landscape' },
  'collection-best-sellers': { query: 'flower shop display', orientation: 'landscape' },

  'hero-01': { query: 'florist shop flowers', orientation: 'landscape' },
  'hero-02': { query: 'peony bouquet', orientation: 'landscape' },
  'hero-03': { query: 'flower subscription bouquet', orientation: 'landscape' },

  'tile-01': { query: 'birthday flowers bouquet', orientation: 'square' },
  'tile-02': { query: 'red roses romantic bouquet', orientation: 'square' },
  'tile-03': { query: 'florist delivering flowers', orientation: 'square' },
  'tile-04': { query: 'congratulation plant pot', orientation: 'square' },
  'tile-05': { query: 'elegant formal bouquet', orientation: 'square' },
  'tile-06': { query: 'wedding flowers bridal', orientation: 'square' },
  'tile-07': { query: 'white lilies condolence', orientation: 'square' },
  'tile-08': { query: 'flower market stall', orientation: 'square' },

  'magazine-01': { query: 'flowers in vase', orientation: 'landscape' },
  'magazine-02': { query: 'flowers editorial still life', orientation: 'landscape' },
  'magazine-03': { query: 'florist studio workspace', orientation: 'landscape' },
  'magazine-04': { query: 'fresh flowers close up', orientation: 'landscape' },
  'magazine-05': { query: 'flower bouquet gift wrap', orientation: 'landscape' },
  'event-01': { query: 'flower shop celebration', orientation: 'landscape' },

  'subscribe-01': { query: 'weekly flower delivery bouquet', orientation: 'landscape' },
  'subscribe-02': { query: 'weekly flower delivery bouquet', orientation: 'landscape' },
  'subscribe-03': { query: 'weekly flower delivery bouquet', orientation: 'landscape' },

  'bg-famous': { query: 'art gallery wall framed paintings', orientation: 'landscape' },
};

/** Gallery variant suffix: `bouquet-01-2` belongs to the `bouquet-01` family. */
const GALLERY_VARIANT = /-[23]$/;

function specFor(name: string): SlotSpec {
  const fixed = STATIC_SLOTS[name];
  if (fixed) return fixed;

  const family = name.replace(GALLERY_VARIANT, '');
  const query = PRODUCT_QUERIES[family];
  if (query) return { query, orientation: 'square' };

  throw new Error(`No seed image plan entry for "${name}"`);
}

/* -------------------------------------------------------------------------- */
/* Pexels                                                                      */
/* -------------------------------------------------------------------------- */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pexels throttles rapid bursts from one IP with 429s after a handful of quick
 * requests, so every search passes through this gate; combined with the 429
 * backoff below it keeps long seeding runs under the burst radar.
 */
const PEXELS_SEARCH_INTERVAL_MS = 4500;
const PEXELS_SEARCH_ATTEMPTS = 12;
const PEXELS_429_MAX_BACKOFF_MS = 30_000;
let pexelsGate: Promise<void> = Promise.resolve();
let lastPexelsSearchAt = 0;

function pacePexelsSearch(): Promise<void> {
  const scheduled = pexelsGate.then(async () => {
    const wait = lastPexelsSearchAt + PEXELS_SEARCH_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastPexelsSearchAt = Date.now();
  });
  pexelsGate = scheduled.catch(() => undefined);
  return scheduled;
}

async function pexelsSearch(
  key: string,
  query: string,
  orientation: Orientation,
  page: number,
): Promise<PexelsPhoto[]> {
  const url = new URL(PEXELS_API);
  url.searchParams.set('query', query);
  url.searchParams.set('per_page', '80');
  url.searchParams.set('page', String(page));
  url.searchParams.set('orientation', orientation);

  for (let attempt = 0; ; attempt += 1) {
    await pacePexelsSearch();
    const res = await fetch(url, { headers: { Authorization: key } });
    if (res.ok) {
      const payload = (await res.json()) as { photos?: PexelsPhoto[] };
      return payload.photos ?? [];
    }
    if (res.status === 429 && attempt < PEXELS_SEARCH_ATTEMPTS - 1) {
      // Edge throttles can persist for minutes; back off progressively so a
      // single search outlasts them instead of aborting the whole seed.
      await sleep(Math.min(6000 * (attempt + 1), PEXELS_429_MAX_BACKOFF_MS));
      continue;
    }
    throw new Error(`Pexels search failed with status ${res.status} for "${query}"`);
  }
}

interface Pool {
  photos: PexelsPhoto[];
  cursor: number;
  nextPage: number;
  done: boolean;
  /** Concurrent slots share one in-flight page fetch instead of racing. */
  filling?: Promise<void>;
}

/* -------------------------------------------------------------------------- */
/* ThanksFlowers download + validation                                         */
/* -------------------------------------------------------------------------- */

interface SniffedImage {
  ext: string;
  mime: string;
}

/** Magic-byte check so a redirect to an HTML error page can never be uploaded. */
function sniffImageBytes(buf: Buffer): SniffedImage | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return { ext: 'png', mime: 'image/png' };
  }
  if (buf.length >= 4 && buf.subarray(0, 4).toString('latin1') === 'GIF8') {
    return { ext: 'gif', mime: 'image/gif' };
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buf.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return { ext: 'webp', mime: 'image/webp' };
  }
  return null;
}

class TfFetchError extends Error {
  constructor(message: string, readonly retriable: boolean) {
    super(message);
    this.name = 'TfFetchError';
  }
}

interface TfDownload {
  bytes: Buffer;
  ext: string;
}

/**
 * Downloads one image from the source page and rejects anything that is not a
 * real raster image of sane size. Network errors, 429 and 5xx are retried;
 * definitive answers (404, HTML payload, bad bytes) are not.
 */
async function downloadTfImage(path: string): Promise<TfDownload> {
  const url = `${TF_ORIGIN}${path}`;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TF_FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; flowershop-seed/1.0)' },
      });
      if (!res.ok) {
        throw new TfFetchError(`HTTP ${res.status}`, res.status === 429 || res.status >= 500);
      }
      const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
      if (contentType.includes('text/html')) {
        throw new TfFetchError(`content-type is "${contentType}"`, false);
      }
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length < TF_MIN_BYTES) {
        throw new TfFetchError(`${bytes.length} bytes is suspiciously small`, false);
      }
      if (bytes.length > TF_MAX_BYTES) {
        throw new TfFetchError(`${bytes.length} bytes exceeds the ${TF_MAX_BYTES} limit`, false);
      }
      const sniffed = sniffImageBytes(bytes);
      if (!sniffed) {
        throw new TfFetchError('bytes are not a supported raster image', false);
      }
      return { bytes, ext: sniffed.ext };
    } catch (err) {
      lastError = err as Error;
      const retriable = err instanceof TfFetchError ? err.retriable : true;
      if (!retriable || attempt === 3) break;
      await sleep(2500 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(`ThanksFlowers image download failed for ${path}: ${lastError?.message ?? 'unknown error'}`);
}

/* -------------------------------------------------------------------------- */
/* resolver                                                                    */
/* -------------------------------------------------------------------------- */

export function createSeedAssets(): SeedAssets {
  const key = process.env.PEXELS_API_KEY?.trim() || null;
  const live = Boolean(key) && isCloudinaryConfigured();

  if (!live) {
    logger.warn(
      'Seed images: PEXELS_API_KEY or CLOUDINARY_* is missing - falling back to the checked-in local artwork',
      { pexels: Boolean(key), cloudinary: isCloudinaryConfigured() },
    );
    return {
      live: false,
      resolve: async (name) => ({ url: seedImage(name) }),
      resolveTf: async () => {
        // The imported catalog falls back to the local artwork in this mode;
        // callers only reach for this pipeline when assets.live is true.
        throw new Error('ThanksFlowers image pipeline requires PEXELS_API_KEY and Cloudinary configuration');
      },
      stats: () => ({
        searches: 0,
        photosDownloaded: 0,
        photosUploaded: 0,
        assetsReused: 0,
        mediaReused: 0,
        mediaCreated: 0,
        tfDownloaded: 0,
        tfUploaded: 0,
        tfAssetsReused: 0,
        tfMediaReused: 0,
        tfMediaCreated: 0,
      }),
      verifyUrl: async () => false,
    };
  }

  const stats: SeedAssetStats = {
    searches: 0,
    photosDownloaded: 0,
    photosUploaded: 0,
    assetsReused: 0,
    mediaReused: 0,
    mediaCreated: 0,
    tfDownloaded: 0,
    tfUploaded: 0,
    tfAssetsReused: 0,
    tfMediaReused: 0,
    tfMediaCreated: 0,
  };
  const pools = new Map<string, Pool>();
  const resolved = new Map<string, Promise<ResolvedImage>>();
  const resolvedTf = new Map<string, Promise<ResolvedImage>>();

  function fillPool(pool: Pool, query: string, orientation: Orientation): Promise<void> {
    if (pool.filling) return pool.filling;
    const task = (async () => {
      if (pool.nextPage > MAX_PAGES) {
        pool.done = true;
        return;
      }
      stats.searches += 1;
      const batch = await pexelsSearch(key as string, query, orientation, pool.nextPage);
      pool.nextPage += 1;
      if (batch.length === 0) pool.done = true;
      else pool.photos.push(...batch);
    })().finally(() => {
      pool.filling = undefined;
    });
    pool.filling = task;
    return task;
  }

  async function nextPhoto(query: string, orientation: Orientation): Promise<PexelsPhoto> {
    const poolKey = `${orientation}:${query}`;
    let pool = pools.get(poolKey);
    if (!pool) {
      pool = { photos: [], cursor: 0, nextPage: 1, done: false };
      pools.set(poolKey, pool);
    }
    if (pool.cursor >= pool.photos.length && !pool.done) {
      await fillPool(pool, query, orientation);
    }
    if (pool.cursor >= pool.photos.length) {
      throw new Error(`Pexels returned no more photos for "${query}" (${orientation})`);
    }
    return pool.photos[pool.cursor++];
  }

  async function downloadPhoto(url: string): Promise<Buffer> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Pexels image download failed with status ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  function uploadPhoto(buffer: Buffer, publicId: string): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { public_id: publicId, resource_type: 'image', overwrite: false, invalidate: false },
        (err, result) => {
          if (err || !result) reject(err ?? new Error('Cloudinary returned no result'));
          else resolve(result);
        },
      );
      stream.end(buffer);
    });
  }

  function mimeFromFormat(format?: string): string {
    return format === 'jpg' ? 'image/jpeg' : `image/${format ?? 'jpeg'}`;
  }

  async function ensureMedia(photo: PexelsPhoto): Promise<MediaDocument> {
    const externalId = String(photo.id);

    // Deterministic identity: one Pexels photo maps to exactly one Media row.
    const existing = await Media.findOne({ 'source.provider': 'pexels', 'source.externalId': externalId });
    if (existing && isOurCloudinaryUrl(existing.url)) {
      stats.mediaReused += 1;
      return existing;
    }

    const publicId = `${scopedFolder(SEED_FOLDER)}/pexels-${externalId}`;

    // A previous run may have uploaded the asset before the DB was reset.
    let asset = await cloudinary.api
      .resource(publicId, { resource_type: 'image' })
      .catch(() => null);

    if (asset) {
      stats.assetsReused += 1;
    } else {
      const remote = photo.src?.large2x ?? photo.src?.large ?? photo.src?.original;
      if (!remote) throw new Error(`Pexels photo ${externalId} carries no downloadable source`);
      const buffer = await downloadPhoto(remote);
      stats.photosDownloaded += 1;
      asset = await uploadPhoto(buffer, publicId);
      stats.photosUploaded += 1;
    }

    const source: MediaSource = {
      provider: 'pexels',
      externalId,
      photographer: photo.photographer,
      photographerUrl: photo.photographer_url,
      // Attribution metadata only - never rendered as the displayed image.
      sourceUrl: photo.url,
    };

    const doc = await Media.findOneAndUpdate(
      { key: asset.public_id },
      {
        $set: {
          key: asset.public_id,
          url: deliveryUrl(asset.public_id),
          originalName: `pexels-${externalId}.jpg`,
          mimeType: mimeFromFormat(asset.format),
          size: asset.bytes ?? 0,
          width: asset.width,
          height: asset.height,
          folder: SEED_FOLDER,
          source,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    stats.mediaCreated += 1;
    return doc;
  }

  /** Deterministic identity: one source-page image maps to one Media row. */
  function tfIdentity(ref: TfImageRef): { hash10: string; externalId: string; publicId: string } {
    const hash10 = createHash('sha1').update(ref.path).digest('hex').slice(0, 10);
    return {
      hash10,
      externalId: `thanksflowers:${ref.tfSlug}:${hash10}`,
      publicId: `${scopedFolder(SEED_FOLDER)}/tf-${ref.tfSlug}-${hash10}`,
    };
  }

  async function ensureTfMedia(ref: TfImageRef): Promise<MediaDocument> {
    const { hash10, externalId, publicId } = tfIdentity(ref);

    const existing = await Media.findOne({ 'source.provider': 'thanksflowers', 'source.externalId': externalId });
    if (existing && isOurCloudinaryUrl(existing.url)) {
      stats.tfMediaReused += 1;
      return existing;
    }

    // A previous run may have uploaded the asset before the DB was reset.
    let asset = await cloudinary.api
      .resource(publicId, { resource_type: 'image' })
      .catch(() => null);

    if (asset) {
      stats.tfAssetsReused += 1;
    } else {
      const download = await downloadTfImage(ref.path);
      stats.tfDownloaded += 1;
      asset = await uploadPhoto(download.bytes, publicId);
      stats.tfUploaded += 1;
    }

    const source: MediaSource = {
      provider: 'thanksflowers',
      externalId,
      // Both URLs are metadata only - never rendered; display uses Cloudinary.
      sourceUrl: `${TF_ORIGIN}${ref.path}`,
      sourceProductUrl: ref.productUrl,
    };

    const doc = await Media.findOneAndUpdate(
      { key: asset.public_id },
      {
        $set: {
          key: asset.public_id,
          url: deliveryUrl(asset.public_id),
          originalName: `tf-${ref.tfSlug}-${hash10}.${asset.format ?? 'jpg'}`,
          mimeType: mimeFromFormat(asset.format),
          size: asset.bytes ?? 0,
          width: asset.width,
          height: asset.height,
          folder: SEED_FOLDER,
          source,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    stats.tfMediaCreated += 1;
    return doc;
  }

  async function resolveLive(name: string): Promise<ResolvedImage> {
    const spec = specFor(name);
    const photo = await nextPhoto(spec.query, spec.orientation);
    const media = await ensureMedia(photo);
    return { url: media.url, publicId: media.key, mediaId: media._id };
  }

  return {
    live: true,
    resolve(name: string): Promise<ResolvedImage> {
      const cached = resolved.get(name);
      if (cached) return cached;
      const task = resolveLive(name).catch((err) => {
        resolved.delete(name);
        throw err;
      });
      resolved.set(name, task);
      return task;
    },
    resolveTf(ref: TfImageRef): Promise<ResolvedImage> {
      const key = tfIdentity(ref).externalId;
      const cached = resolvedTf.get(key);
      if (cached) return cached;
      const task = ensureTfMedia(ref)
        .then((media) => ({ url: media.url, publicId: media.key, mediaId: media._id }))
        .catch((err) => {
          resolvedTf.delete(key);
          throw err;
        });
      resolvedTf.set(key, task);
      return task;
    },
    stats: () => stats,
    async verifyUrl(url: string): Promise<boolean> {
      try {
        const res = await fetch(url, { method: 'HEAD' });
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}
