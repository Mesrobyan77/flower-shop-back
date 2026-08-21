/* eslint-disable no-console */
import { connectDatabase, disconnectDatabase } from '../config/db';
import { runSeed } from './run';

const FRESH = process.argv.includes('--fresh');

async function main() {
  await connectDatabase();
  await runSeed({ fresh: FRESH });
  await disconnectDatabase();
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDatabase();
  process.exit(1);
});
