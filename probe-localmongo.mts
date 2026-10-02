/* Scratch read-only probe: list local mongo databases and sample products. */
import { MongoClient } from 'mongodb';

const run = async () => {
  const client = new MongoClient('mongodb://127.0.0.1:27017/?serverSelectionTimeoutMS=5000');
  await client.connect();
  const admin = client.db().admin();
  const { databases } = await admin.listDatabases();
  for (const d of databases) {
    if (['admin', 'local', 'config'].includes(d.name)) continue;
    const db = client.db(d.name);
    const names = (await db.listCollections().toArray()).map((c) => c.name).sort();
    console.log('DB', d.name, '| collections:', names.join(','));
    if (names.includes('products')) {
      const total = await db.collection('products').countDocuments();
      const sample = await db
        .collection('products')
        .find({}, { projection: { slug: 1, 'name.ru': 1, 'images.0.url': 1 } })
        .sort({ _id: 1 })
        .toArray();
      const localArt = sample.filter((p) => typeof p.images?.[0]?.url === 'string' && p.images[0].url.startsWith('/images/')).length;
      const cloud = sample.filter((p) => typeof p.images?.[0]?.url === 'string' && p.images[0].url.includes('cloudinary')).length;
      console.log('  products total:', total, '| first-sorted localArt:', localArt, '| cloudinary:', cloud);
      console.log('  sample slugs:', sample.slice(0, 10).map((p) => `${p.slug}(${p.images?.[0]?.url === undefined || String(p.images?.[0]?.url).slice(0, 12)})`).join(' '));
      const stockJunk = await db.collection('products').countDocuments({ slug: /^stock-/ });
      console.log('  stock-* test products:', stockJunk);
    }
  }
  await client.close();
};

run().catch((e) => {
  console.error(e);
  throw e;
});
