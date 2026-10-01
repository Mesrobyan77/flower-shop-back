import { cloudinary } from './src/config/cloudinary';
import { MongoClient } from 'mongodb';
import { env } from './src/config/env';

const client = new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
await client.connect();
const db = client.db(env.MONGODB_DB ?? 'anahit_flower');

const setting = await db.collection('settings').findOne({ key: 'storefront' });
console.log('SOCIAL', JSON.stringify(setting?.social ?? null));
console.log('SETTING_UPDATED', setting?.updatedAt?.toISOString?.() ?? 'n/a');

const media = db.collection('media');
console.log('MEDIA_TF', await media.countDocuments({ 'source.provider': 'thanksflowers' }));
console.log('MEDIA_PEXELS', await media.countDocuments({ 'source.provider': 'pexels' }));
console.log('MEDIA_OTHER', await media.countDocuments({ 'source.provider': { $nin: ['thanksflowers', 'pexels'] } }));

const tfSample = await media.find({ 'source.provider': 'thanksflowers' }).limit(3).toArray();
for (const row of tfSample) {
  try {
    const asset = await cloudinary.api.resource(row.key, { resource_type: 'image' });
    console.log('TF_ASSET', row.key, '| created', asset.created_at, '| bytes', asset.bytes);
  } catch (e) {
    console.log('TF_ASSET_FAIL', row.key, (e as { message?: string }).message);
  }
}
const pxSample = await media.find({ 'source.provider': 'pexels' }).limit(2).toArray();
for (const row of pxSample) {
  try {
    const asset = await cloudinary.api.resource(row.key, { resource_type: 'image' });
    console.log('PX_ASSET', row.key, '| created', asset.created_at, '| bytes', asset.bytes);
  } catch (e) {
    console.log('PX_ASSET_FAIL', row.key, (e as { message?: string }).message);
  }
}

const products = await db.collection('products').find({}).toArray();
const withImages = products.filter((p) => Array.isArray(p.images) && p.images.length > 0);
console.log('PRODUCTS', products.length, '| WITH_IMAGES', withImages.length);
const sample = withImages[0];
console.log('SAMPLE_IMG', JSON.stringify(sample?.images?.[0] ?? null));

// product -> media provider mapping
const mediaIds = new Set<string>();
for (const p of withImages) for (const img of p.images) if (img?.mediaId) mediaIds.add(String(img.mediaId));
console.log('PRODUCT_MEDIA_IDS', mediaIds.size);
const rows = await media.find({}).toArray();
let tfLinked = 0;
let pxLinked = 0;
let missing = 0;
for (const p of withImages) {
  const providers = new Set<string>();
  for (const img of p.images) {
    if (!img?.mediaId) { missing++; continue; }
    const m = rows.find((r) => String(r._id) === String(img.mediaId));
    if (!m) { missing++; continue; }
    providers.add(String(m.source?.provider ?? 'none'));
  }
  if (providers.has('thanksflowers')) tfLinked++;
  else if (providers.has('pexels')) pxLinked++;
  else if (providers.size === 0) missing++;
}
console.log('PRODUCTS_TF_LINKED', tfLinked, '| PX_LINKED', pxLinked, '| IMG_MISSING', missing);

await client.close();
process.exit(0);
