/* eslint-disable no-console */
/**
 * Creates and reconciles every index the models declare - including the unique
 * ones that stop two members sharing an email and stop an order code colliding.
 *
 * MongoDB never creates indexes by itself and `autoIndex` is off outside
 * development (see `config/db.ts`), so a fresh deployment has to run this once:
 *
 *   npm run db:indexes
 *
 * `syncIndexes` is idempotent: it builds what the models declare and drops what
 * they no longer do. Nothing is taken on trust: after the sync every model is
 * re-read once the builds have had time to settle, and every unique index is
 * checked against the data itself (group by the key, look for a group holding
 * more than one document - an index listed while its build is still settling
 * cannot hide duplicates). A run that reaches the summary really did create
 * every index; anything else exits 1 naming the model and the index. Only index
 * names and counts are printed - never documents, never the connection string.
 */
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/db';
import { env } from '../config/env';
import '../models';

/** Index names on a collection; a collection that does not exist yet has none. */
async function indexNames(collection: mongoose.Collection): Promise<string[]> {
  try {
    const rows = (await collection.indexes()) as { name?: string }[];
    return rows.map((row) => row.name).filter((name): name is string => Boolean(name));
  } catch (err) {
    if ((err as { code?: number }).code === 26) return []; // NamespaceNotFound
    throw err;
  }
}

interface DeclaredIndex {
  name: string;
  keys: Record<string, unknown>;
  unique: boolean;
  sparse: boolean;
  partial?: Record<string, unknown>;
}

/** Every index a model declares, under the name MongoDB gives it. */
function declaredIndexes(model: mongoose.Model<unknown>): DeclaredIndex[] {
  const definitions = model.schema.indexes() as unknown as [Record<string, unknown>, Record<string, unknown>][];
  return definitions.map(([keys, options]) => ({
    name:
      (options.name as string | undefined) ??
      Object.entries(keys)
        .map(([path, direction]) => `${path}_${direction}`)
        .join('_'),
    keys,
    unique: options.unique === true,
    sparse: options.sparse === true,
    partial: options.partialFilterExpression as Record<string, unknown> | undefined,
  }));
}

/**
 * Read-only proof that a unique index really holds: group the collection by the
 * key and stop at the first group containing more than one document.
 * `listIndexes` can name an index whose build is still settling - or one about
 * to abort because of exactly these duplicates - while the data itself cannot
 * lie. Sparse and partial indexes cover only part of the collection, so the
 * check is limited to the documents they actually contain.
 */
async function duplicateKeyGroups(model: mongoose.Model<unknown>, index: DeclaredIndex): Promise<number> {
  const fields = Object.keys(index.keys);
  const conditions: Record<string, unknown>[] = [];
  if (index.partial) conditions.push(index.partial);
  if (index.sparse) conditions.push({ $or: fields.map((field) => ({ [field]: { $exists: true } })) });

  const groupedId: Record<string, unknown> = {};
  for (const field of fields) groupedId[field] = `$${field}`;

  const pipeline: Record<string, unknown>[] = [
    ...(conditions.length > 0 ? [{ $match: { $and: conditions } }] : []),
    { $group: { _id: groupedId, matches: { $sum: 1 } } },
    { $match: { matches: { $gt: 1 } } },
    { $count: 'groups' },
  ];

  const db = mongoose.connection.db;
  if (!db) throw new Error('database is not connected');

  const rows = (await db.collection(model.collection.name).aggregate(pipeline).toArray()) as { groups?: number }[];
  return rows[0]?.groups ?? 0;
}

const firstLine = (err: unknown) => (err instanceof Error ? err.message : String(err)).split('\n')[0];

async function main() {
  console.log(`Reconciling indexes in database "${env.MONGODB_DB}"`);
  await connectDatabase();

  let models = 0;
  let created = 0;
  let dropped = 0;
  const failures: string[] = [];

  for (const model of Object.values(mongoose.models)) {
    models += 1;
    try {
      const declared = declaredIndexes(model);
      const before = new Set(await indexNames(model.collection));
      const obsolete = await model.syncIndexes();
      const after = new Set(await indexNames(model.collection));
      const added = [...after].filter((name) => !before.has(name));
      const missing = declared.filter((index) => !after.has(index.name)).map((index) => index.name);

      created += added.length;
      dropped += obsolete.length;
      if (missing.length > 0) failures.push(`${model.modelName}: not created - ${missing.join(', ')}`);

      const note = missing.length > 0 ? ` - NOT CREATED ${missing.join(', ')}` : '';
      console.log(`  ${model.modelName}: ${after.size} indexes (${added.length} created, ${obsolete.length} dropped)${note}`);
    } catch (err) {
      failures.push(`${model.modelName}: ${firstLine(err)}`);
      console.log(`  ${model.modelName}: FAILED - ${firstLine(err)}`);
    }
  }

  // A build can still be settling when syncIndexes resolves: a unique index whose
  // collection holds duplicates is listed by listIndexes and gone again a moment
  // later. Give every build time to finish or abort, then look a second time.
  await new Promise((resolve) => setTimeout(resolve, 2000));

  let verified = 0;
  for (const model of Object.values(mongoose.models)) {
    try {
      const declared = declaredIndexes(model);
      const present = new Set(await indexNames(model.collection));

      for (const index of declared.filter((entry) => !present.has(entry.name))) {
        failures.push(`${model.modelName}: ${index.name} is missing after the sync`);
      }
      for (const index of declared.filter((entry) => entry.unique)) {
        const groups = await duplicateKeyGroups(model, index);
        if (groups > 0) {
          failures.push(
            `${model.modelName}: unique index ${index.name} cannot be enforced - ${groups} key value(s) are repeated in the collection`,
          );
        }
      }
      verified += declared.length;
    } catch (err) {
      failures.push(`${model.modelName}: verification failed - ${firstLine(err)}`);
    }
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} index problem(s) must be resolved before this deployment is safe:`);
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error(
      '\nA unique index that will not build usually means the collection already holds duplicate\n' +
        'values - remove them and re-run. A rejected specification means the index definition is not\n' +
        'supported by this MongoDB server version.',
    );
    await disconnectDatabase();
    process.exit(1);
  }

  console.log(
    `\n${models} models reconciled: ${created} indexes created, ${dropped} obsolete indexes dropped` +
      `\nVerified: ${verified} declared indexes present, all unique keys hold`,
  );
  await disconnectDatabase();
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
