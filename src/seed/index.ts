/* eslint-disable no-console */
import { connectDatabase, disconnectDatabase } from '../config/db';
import { env } from '../config/env';
import { runSeed } from './run';

/** `SEED_RESET=true npm run seed` (or the legacy `--fresh` flag) drops the DB first. */
const RESET = process.env.SEED_RESET === 'true' || process.argv.includes('--fresh');

async function main() {
  /**
   * Refused before the database is touched: a destructive run must be asked for
   * explicitly and can only ever target a development or test database. There is
   * no flag that lets production through.
   */
  if (RESET && env.isProd) {
    console.error(
      'seed refused: SEED_RESET deletes the whole database and production is never allowed to reset.',
    );
    process.exit(1);
  }

  if (RESET && env.NODE_ENV !== 'development' && env.NODE_ENV !== 'test') {
    console.error(
      `seed refused: a destructive reset requires NODE_ENV=development or test (got "${env.NODE_ENV}").`,
    );
    process.exit(1);
  }

  await connectDatabase();
  await runSeed({ fresh: RESET, confirmDestructive: RESET });
  await disconnectDatabase();
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDatabase();
  process.exit(1);
});
