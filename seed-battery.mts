/**
 * Final assertion battery for the ThanksFlowers image import (checkpoint item 45).
 * Read-only: proves for every seeded product that the full chain holds:
 * sourceProductUrl -> downloaded source image -> our Cloudinary upload ->
 * Media record -> Product.images[] reference. Nothing is considered seeded
 * merely because a filename exists in the seed data.
 */
import { createHash } from 'node:crypto';
import { MongoClient, type Document } from 'mongodb';
import { env } from './src/config/env';
import { tfSeedProducts } from './src/seed/data/tf-products';

const TF_ORIGIN = 'https://thanksflowers.am';
const fail: string[] = [];
const note = (tag: string, msg: string) => {
  fail.push(`${tag} ${msg}`);
  console.log(`FAIL ${tag} ${msg}`);
};

/* ---------------- Part 0: static dataset audit ---------------- */
console.log(`PART0_TF_PRODUCTS ${tfSeedProducts.length}`);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const productUrlSeen = new Map<string, string>();
for (const item of tfSeedProducts) {
  const s = item.source;
  if (!s || s.provider !== 'thanksflowers') { note('P0_SOURCE', `${item.slug}: missing source`); continue; }
  if (!/^https:\/\/thanksflowers\.am\/product\/[a-z0-9-]+\/$/.test(s.productUrl))
    note('P0_URL', `${item.slug}: bad productUrl ${s.productUrl}`);
  if (productUrlSeen.has(s.productUrl)) note('P0_URL_DUP', `${item.slug} shares ${s.productUrl} with ${productUrlSeen.get(s.productUrl)}`);
  productUrlSeen.set(s.productUrl, item.slug);
  if (!uuid.test(s.tfId)) note('P0_TFID', `${item.slug}: bad tfId ${s.tfId}`);
  if (!Array.isArray(s.images) || s.images.length === 0) note('P0_IMAGES', `${item.slug}: no source images`);
  for (const p of s.images) {
    if (!/^\/media\/[A-Za-z0-9_./-]+\.(webp|jpe?g|png)$/.test(p)) note('P0_IMGPATH', `${item.slug}: suspicious path ${p}`);
  }
}
console.log(`PART0_DONE violations=${fail.length}`);

/* ---------------- helpers ---------------- */
async function head(url: string): Promise<number> {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(20000) });
    if (res.status < 400) return res.status;
  } catch { /* fall through to GET */ }
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
    await res.body?.cancel();
    return res.status;
  } catch (e) {
    return -1;
  }
}
async function pool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

/* ---------------- Part 1+3: DB chain + leak scan ---------------- */
const client = new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
await client.connect();
const db = client.db(env.MONGODB_DB ?? 'anahit_flower');

const products = await db.collection('products').find({}).toArray();
const mediaRows = await db.collection('media').find({}).toArray();
const mediaById = new Map(mediaRows.map((m) => [String(m._id), m]));
const mediaByKey = new Map(mediaRows.map((m) => [String(m.key), m]));
const dsBySlug = new Map(tfSeedProducts.map((p) => [p.slug, p]));

console.log(`DB_PRODUCTS ${products.length} DB_MEDIA ${mediaRows.length}`);

// leak scan: display surfaces must never carry source hosts (source metadata excluded)
const leakHosts = ['thanksflowers.am', 'images.pexels.com'];
for (const col of ['products', 'collections', 'categories', 'posts', 'plans'] as const) {
  const docs = await db.collection(col).find({}).toArray();
  for (const doc of docs) {
    const clone: Document = { ...doc };
    delete clone.source;
    if (clone.images) clone.images = (clone.images as Document[]).map((img) => { const c = { ...img }; delete c.source; return c; });
    const text = JSON.stringify(clone);
    for (const host of leakHosts) if (text.includes(host)) note('P3_LEAK', `${col} ${doc.slug ?? doc._id}: contains ${host}`);
  }
}
const settings = await db.collection('settings').find({}).toArray();
for (const doc of settings) {
  const text = JSON.stringify(doc);
  for (const host of leakHosts) if (text.includes(host)) note('P3_LEAK', `settings ${doc.key}: contains ${host}`);
}
console.log('PART3_DONE');

// per-product chain verification
type CheckedImage = { url: string; label: string };
const checked: CheckedImage[] = [];
let tfPassed = 0, tfFailed = 0, stdPassed = 0, stdFailed = 0, noImages = 0;

for (const product of products) {
  const slug = String(product.slug);
  const ds = dsBySlug.get(slug);
  const images = Array.isArray(product.images) ? (product.images as Document[]) : [];
  if (images.length === 0) { noImages += 1; note('P1_NOIMAGES', `${slug}: product has no images`); continue; }

  let ok = true;
  const seenPublicIds = new Set<string>();
  for (const img of images) {
    const mediaId = img.mediaId ? String(img.mediaId) : '';
    const media = mediaId ? mediaById.get(mediaId) : undefined;
    if (!media) { note('P1_MEDIA', `${slug}: image ${img.publicId} has no Media record (mediaId=${mediaId || 'missing'})`); ok = false; continue; }
    if (String(media.key) !== String(img.publicId)) { note('P1_KEY', `${slug}: image publicId ${img.publicId} != media.key ${media.key}`); ok = false; }
    const url = String(media.url ?? '');
    if (!url.startsWith('https://res.cloudinary.com/')) { note('P1_URL', `${slug}: media.url not our Cloudinary: ${url}`); ok = false; }
    if (String(img.url) !== url) { note('P1_MISMATCH', `${slug}: image.url != media.url`); ok = false; }
    seenPublicIds.add(String(media.key));
    checked.push({ url, label: `${slug}/${media.key}` });

    const src = (media.source ?? {}) as Document;
    if (src.provider === 'thanksflowers') {
      if (!src.sourceProductUrl) { note('P1_PRODUCTURL', `${slug}: media ${media.key} lacks sourceProductUrl`); ok = false; }
      if (!src.sourceUrl || !String(src.sourceUrl).startsWith(TF_ORIGIN)) { note('P1_SOURCEURL', `${slug}: media ${media.key} bad sourceUrl ${src.sourceUrl}`); ok = false; }
    } else if (src.provider === 'pexels') {
      if (!src.sourceUrl) { note('P1_PEXELSSRC', `${slug}: media ${media.key} lacks sourceUrl`); ok = false; }
    } else {
      note('P1_PROVIDER', `${slug}: media ${media.key} unknown provider ${String(src.provider)}`); ok = false;
    }
  }

  if (String(product.thumbnail ?? '') !== String(images[0]?.url ?? '')) { note('P1_THUMB', `${slug}: thumbnail != images[0].url`); ok = false; }

  if (ds?.source) {
    // every dataset source path must be present as exactly one product image
    for (const p of ds.source.images) {
      const hash10 = createHash('sha1').update(p).digest('hex').slice(0, 10);
      const expectedKey = `${env.CLOUDINARY_FOLDER}/seed/tf-${ds.source.tfSlug}-${hash10}`;
      if (!seenPublicIds.has(expectedKey)) { note('P1_CHAIN', `${slug}: dataset image ${p} not linked (expected ${expectedKey})`); ok = false; }
    }
    const productUrls = new Set(images.map((i) => String(mediaById.get(String(i.mediaId))?.source?.sourceProductUrl ?? '')));
    if (productUrls.size !== 1 || !productUrls.has(ds.source.productUrl)) {
      note('P1_SRCURL_SET', `${slug}: sourceProductUrl set ${[...productUrls].join(',')} != dataset ${ds.source.productUrl}`); ok = false;
    }
    if (ok) tfPassed++; else tfFailed++;
  } else {
    if (ok) stdPassed++; else stdFailed++;
  }
}

console.log(`PART1_DONE tfPassed=${tfPassed} tfFailed=${tfFailed} stdPassed=${stdPassed} stdFailed=${stdFailed} noImages=${noImages}`);

// Cloudinary asset existence via delivery HEAD (CDN, no admin quota)
const uniqueUrls = [...new Set(checked.map((c) => c.url))];
const statuses = await pool(uniqueUrls, 8, async (u) => ({ u, s: await head(u) }));
let headOk = 0;
for (const { u, s } of statuses) {
  if (s === 200) headOk++;
  else note('P1_HEAD', `${u} -> ${s}`);
}
console.log(`PART1_HEAD ok=${headOk}/${uniqueUrls.length}`);

/* ---------------- Part 2: live provenance sample ---------------- */
const dsAll = tfSeedProducts;
const sampleIdx = [0, 7, 14, 21, 28, dsAll.length - 1].filter((i) => i < dsAll.length);
const uniqIdx = [...new Set(sampleIdx)];
console.log(`PART2_SAMPLE pages=${uniqIdx.length}`);
for (const i of uniqIdx) {
  const item = dsAll[i];
  const url = item.source!.productUrl;
  let html = '';
  let status = -1;
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(25000), headers: { 'user-agent': 'Mozilla/5.0 (compatible; catalog-import-check/1.0)' } });
    status = res.status;
    html = await res.text();
  } catch (e) {
    note('P2_FETCH', `${url}: ${(e as Error).message}`);
    continue;
  }
  const found: boolean[] = [];
  for (const p of item.source!.images) {
    const inPage = html.includes(p) || html.includes(encodeURI(p)) || html.includes(p.replace('/media/', '/media/'));
    found.push(inPage);
  }
  const allFound = found.every(Boolean);
  console.log(`PART2 ${allFound ? 'OK' : 'PARTIAL'} ${url} status=${status} images=${found.filter(Boolean).length}/${found.length}`);
  if (!allFound) note('P2_EXTRACT', `${url}: paths missing from live page (${item.source!.images.filter((p, idx) => !found[idx]).join(', ')})`);
  await new Promise((r) => setTimeout(r, 1500));
}

await client.close();
console.log(`BATTERY_DONE failures=${fail.length}`);
if (fail.length) console.log('BATTERY_FAILURES:\n' + fail.join('\n'));
process.exit(fail.length ? 1 : 0);
