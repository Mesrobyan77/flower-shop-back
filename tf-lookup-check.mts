import { cloudinary } from './src/config/cloudinary';
import { MongoClient } from 'mongodb';
import { env } from './src/config/env';

const client = new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
await client.connect();
const db = client.db(env.MONGODB_DB ?? 'anahit_flower');
const rows = await db
  .collection('media')
  .find({ 'source.provider': 'thanksflowers' })
  .limit(5)
  .toArray();

for (const row of rows) {
  try {
    const asset = await cloudinary.api.resource(row.key, { resource_type: 'image' });
    console.log('LOOKUP OK', asset.public_id, asset.bytes, asset.format);
  } catch (error) {
    const e = error as { error?: { message?: string }; http_code?: number; message?: string };
    console.log('LOOKUP FAIL', row.key, '|', e.error?.message ?? e.message, '| http', e.http_code);
  }
}

await client.close();
process.exit(0);
