/* eslint-disable no-console */
/**
 * Boots the API against an ephemeral in-memory MongoDB.
 *
 * Useful for smoke-testing every endpoint without an Atlas cluster or Docker.
 * Data lives only for the lifetime of the process - never use this in production.
 *
 * Run: npm run dev:memory
 */
import { MongoMemoryServer } from 'mongodb-memory-server';

async function main() {
  const mongo = await MongoMemoryServer.create({ instance: { dbName: 'anahit_flower' } });
  process.env.MONGODB_URI = mongo.getUri();
  process.env.MONGODB_DB = 'anahit_flower';

  console.log(`In-memory MongoDB started at ${mongo.getUri()}`);

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
