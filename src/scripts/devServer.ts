/* eslint-disable no-console */
/**
 * Boots the API against an ephemeral in-memory MongoDB.
 *
 * Useful for smoke-testing every endpoint without an Atlas cluster or Docker.
 * Data lives only for the lifetime of the process - never use this in production.
 *
 * Order writes refuse to run without multi-document transactions (see
 * `utils/transaction.ts`), so the default is a single-member replica set. Pass
 * `--standalone` to reproduce a deployment that cannot transact.
 *
 * Run: npm run dev:memory             (replica set - checkout works)
 *      npm run dev:memory:standalone  (standalone - order writes are refused)
 */
import { MongoMemoryReplSet, MongoMemoryServer } from 'mongodb-memory-server';

async function main() {
  const standalone = process.argv.includes('--standalone');

  const mongo = standalone
    ? await MongoMemoryServer.create({ instance: { storageEngine: 'wiredTiger', dbName: 'anahit_flower' } })
    : await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });

  process.env.MONGODB_URI = mongo.getUri();
  process.env.MONGODB_DB = 'anahit_flower';

  console.log(`In-memory MongoDB (${standalone ? 'standalone' : 'replica set'}) started at ${mongo.getUri()}`);

  // Imported after the env var is set so config/env picks it up.
  const { connectDatabase } = await import('../config/db');
  const { createApp } = await import('../app');
  const { env } = await import('../config/env');
  const { ensureCloudinary } = await import('../config/cloudinary');

  await connectDatabase();
  ensureCloudinary();

  const seed = await import('../seed/run');
  await seed.runSeed();

  const app = createApp();
  app.listen(env.PORT, () => {
    console.log(`API (in-memory) listening on http://localhost:${env.PORT}${env.API_PREFIX}`);
  });

  const shutdown = async () => {
    await mongo.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
