/* eslint-disable no-console */
/**
 * Rebuilds every product's advertised rating (`ratingAverage` / `ratingCount`) from
 * the approved `Review` documents, so numbers that were shipped inside the catalogue
 * dataset can no longer be what a shopper sees (F-33).
 *
 *   npx tsx src/scripts/syncRatings.ts          # snapshot only, writes nothing
 *   npx tsx src/scripts/syncRatings.ts --apply  # reconcile
 *
 * The snapshot prints `slug  old -> new` for every product it would touch, which is
 * the record needed to put a value back.
 */
import { connectDatabase, disconnectDatabase } from '../config/db';
import '../models';
import { Product } from '../models/Product';
import { approvedRatingsByProduct, syncAllProductRatings } from '../services/rating.service';

async function main() {
  const apply = process.argv.includes('--apply');
  await connectDatabase();

  const before = await Product.find().select('slug ratingAverage ratingCount').sort({ slug: 1 }).lean();
  const truth = await approvedRatingsByProduct();
  const changes = apply ? 'applied' : 'planned (dry run)';
  console.log(`Rating reconciliation - ${changes}`);

  if (apply) await syncAllProductRatings();

  let touched = 0;
  for (const product of before) {
    const next = truth.get(String(product._id));
    const average = next?.average ?? 0;
    const count = next?.count ?? 0;
    if (product.ratingAverage === average && product.ratingCount === count) continue;
    touched += 1;
    console.log(`${product.slug}: ${product.ratingAverage}/${product.ratingCount} -> ${average}/${count}`);
  }
  console.log(`${touched} of ${before.length} products ${apply ? 'updated' : 'would change'}`);

  await disconnectDatabase();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDatabase();
  process.exit(1);
});
