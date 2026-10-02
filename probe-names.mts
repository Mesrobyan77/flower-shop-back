/* Scratch read-only probe: identify products and their image URL shapes. */
import mongoose from 'mongoose';
import { env } from './src/config/env';

const run = async () => {
  await mongoose.connect(env.MONGODB_URI, { dbName: env.MONGODB_DB });
  const col = mongoose.connection.collection('products');
  const total = await col.countDocuments();
  const byLocal = await col.countDocuments({ 'images.0.url': /^\/images\// });
  const byCloud = await col.countDocuments({ 'images.0.url': /^https:\/\/res\.cloudinary\.com/ });
  console.log('TOTAL', total, '| first-image local:', byLocal, '| first-image cloudinary:', byCloud);
  const named = await col
    .find(
      { 'name.ru': { $in: ['Я тебя люблю', 'Сердце сезона', 'Торт и букет', 'Фиолетовая мечта'] } },
      { projection: { slug: 1, 'name.ru': 1, 'images.url': 1, thumbnail: 1 } },
    )
    .toArray();
  console.log('NAMED MATCHES', named.length);
  for (const p of named) console.log(JSON.stringify({ slug: p.slug, ru: p.name?.ru, img0: p.images?.[0]?.url, thumb: p.thumbnail }));
  const sample = await col.find({}, { projection: { slug: 1, 'name.ru': 1, 'images.0.url': 1 } }).limit(12).toArray();
  console.log('--- first 12 products ---');
  for (const p of sample) console.log(p.slug, '|', p.name?.ru, '|', p.images?.[0]?.url);
  await mongoose.disconnect();
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
