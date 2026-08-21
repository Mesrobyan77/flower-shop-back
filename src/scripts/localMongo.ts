/* eslint-disable no-console */
/**
 * Starts a persistent local MongoDB for development.
 *
 * Unlike `dev:memory`, the data directory survives restarts, so this behaves
 * like a real database you can seed once and keep working against. It runs as a
 * single-member replica set so multi-document transactions work exactly as they
 * do on Atlas.
 *
 * Run: npm run mongo:local     (leave it running in its own terminal)
 * Then: npm run dev
 *
 * Swap MONGODB_URI in .env for an Atlas connection string whenever you have one -
 * nothing else in the app changes.
 */
import fs from 'fs';
import path from 'path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const PORT = Number(process.env.LOCAL_MONGO_PORT ?? 27017);
const DATA_DIR = path.resolve(process.cwd(), '.mongo-data');

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, name: 'rs0', storageEngine: 'wiredTiger' },
    /**
     * `replSet` is missing from the published instance-option type but is read at
     * runtime; without it mongod comes up with replication disabled and
     * `rs.initiate()` fails with NoReplicationEnabled.
     */
    instanceOpts: [
      { port: PORT, dbPath: DATA_DIR, storageEngine: 'wiredTiger', replSet: 'rs0' } as Parameters<typeof MongoMemoryReplSet.create>[0] extends { instanceOpts: (infer T)[] } ? T : never,
    ],
  });

  const uri = `mongodb://127.0.0.1:${PORT}/xch_flower?replicaSet=rs0&directConnection=true`;

  console.log('');
  console.log('  Local MongoDB is running');
  console.log(`  URI       ${uri}`);
  console.log(`  Data dir  ${DATA_DIR}`);
  console.log('');
  console.log('  Leave this terminal open. Stop with Ctrl+C.');
  console.log('');

  const shutdown = async () => {
    console.log('\n  Stopping local MongoDB...');
    // `false` keeps the data directory on disk so the next start resumes it.
    await replSet.stop({ doCleanup: false, force: false });
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
