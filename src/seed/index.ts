/* eslint-disable no-console */
import { connectDatabase, disconnectDatabase } from '../config/db';
import { env } from '../config/env';
import { runSeed } from './run';

const FRESH = process.argv.includes('--fresh');
/** `--yes` acknowledges the destructive `--fresh` wipe (mandatory in production). */
const CONFIRMED = process.argv.includes('--yes');

async function main() {
  /**
   * Refused before the database is touched: a destructive production run needs an
   * explicit `--yes`, so no stale script can empty a live shop.
   */
  if (FRESH && env.isProd && !CONFIRMED) {
    console.error(
      'seed refused: --fresh deletes all seeded collections and production requires an explicit --yes.\n' +
        'Re-run without --fresh for an additive update, or with --yes when that is really what you want.',
    );
    process.exit(1);
  }

  await connectDatabase();
  await runSeed({ fresh: FRESH, confirmDestructive: CONFIRMED });
  await disconnectDatabase();
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDatabase();
  process.exit(1);
});
