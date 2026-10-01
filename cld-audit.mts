import { cloudinary } from './src/config/cloudinary';

const PREFIX = 'anahit-flower/seed/';
const all: Array<{ public_id: string; created_at: string; bytes: number }> = [];
let next: string | undefined;
do {
  const page: { resources: typeof all; next_cursor?: string } = await cloudinary.api.resources({
    type: 'upload',
    prefix: PREFIX,
    max_results: 500,
    ...(next ? { next_cursor: next } : {}),
  });
  all.push(...page.resources.map((r) => ({ public_id: r.public_id, created_at: r.created_at, bytes: r.bytes })));
  next = page.next_cursor;
} while (next);

const tf = all.filter((r) => r.public_id.includes('/tf-'));
const px = all.filter((r) => r.public_id.includes('/pexels-'));
const other = all.filter((r) => !tf.includes(r) && !px.includes(r));

const hash10 = /^anahit-flower\/seed\/(?:tf-.+-[0-9a-f]{10}|pexels-\d+)$/;
const nonCanonical = all.filter((r) => !hash10.test(r.public_id));

console.log('CLOUDINARY_TOTAL_UNDER_SEED', all.length);
console.log('TF_ASSETS', tf.length, '| PX_ASSETS', px.length, '| OTHER', other.length);
console.log('NON_CANONICAL_KEYS', nonCanonical.length);
for (const r of nonCanonical.slice(0, 20)) console.log('  NONCANONICAL', r.public_id, r.created_at);

const oldest = all.map((r) => r.created_at).sort()[0];
const newest = all.map((r) => r.created_at).sort().at(-1);
console.log('OLDEST_CREATED', oldest, '| NEWEST_CREATED', newest);

// --- upload semantics test (self-created tmp asset, destroyed afterwards) ---
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const TEST_ID = 'anahit-flower/tmp/diag-upload-semantics-test';

function upload(buffer: Buffer, publicId: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { public_id: publicId, resource_type: 'image', overwrite: false, invalidate: false },
      (err, result) => (err || !result ? reject(err ?? new Error('no result')) : resolve(result as unknown as Record<string, unknown>)),
    );
    stream.end(buffer);
  });
}

const first = await upload(PNG_1x1, TEST_ID);
console.log('TEST_UPLOAD_1', JSON.stringify({ public_id: first.public_id, created_at: first.created_at, bytes: first.bytes, version: first.version }));
try {
  const second = await upload(PNG_1x1, TEST_ID);
  console.log('TEST_UPLOAD_2_EXISTING_OK', JSON.stringify({ public_id: second.public_id, created_at: second.created_at, bytes: second.bytes, version: second.version }));
} catch (e) {
  const err = e as { message?: string; http_code?: number; error?: { message?: string } };
  console.log('TEST_UPLOAD_2_EXISTING_ERROR |', err.error?.message ?? err.message, '| http', err.http_code);
}
try {
  await cloudinary.api.resource(TEST_ID, { resource_type: 'image' });
  console.log('TEST_RESOURCE_OK');
} catch (e) {
  console.log('TEST_RESOURCE_FAIL', (e as { message?: string }).message);
}
const destroyed = await cloudinary.uploader.destroy(TEST_ID, { resource_type: 'image', invalidate: false });
console.log('TEST_DESTROYED', destroyed.result);

process.exit(0);
