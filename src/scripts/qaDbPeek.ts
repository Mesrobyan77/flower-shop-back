/* eslint-disable no-console */
/**
 * Read-only database peek used by the QA pass to prove that an admin mutation
 * reached the stored document, not just the API response.
 *
 *   npx tsx src/scripts/qaDbPeek.ts Order '{"code":"XF-…"}'
 *
 * It never writes, never prints the connection string, and strips credential
 * fields from whatever it prints.
 */
import mongoose, { type PipelineStage } from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/db';
import '../models';

const SECRET_KEYS = /password|salt|token|secret|sessionid/i;

function redact(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    const candidate = value as { toHexString?: () => string; [key: string]: unknown };
    if (typeof candidate.toHexString === 'function') return candidate.toHexString();
    if (Array.isArray(value)) return value.map(redact);
    return Object.fromEntries(
      Object.entries(candidate).map(([key, nested]) => [
        key,
        SECRET_KEYS.test(key) ? '[redacted]' : redact(nested),
      ]),
    );
  }
  return value;
}

async function main() {
  const [modelName, filterJson = '{}', projectionJson] = process.argv.slice(2);
  if (!modelName) {
    console.log(`models: ${Object.keys(mongoose.models).sort().join(', ')}`);
    return;
  }

  const model = mongoose.models[modelName];
  if (!model) {
    console.error(`unknown model "${modelName}". available: ${Object.keys(mongoose.models).sort().join(', ')}`);
    process.exitCode = 2;
    return;
  }

  const filter = JSON.parse(filterJson) as Record<string, unknown>;
  const projection = projectionJson ? JSON.parse(projectionJson) : undefined;
  const limit = Number(process.env.QA_PEEK_LIMIT ?? 5);

  await connectDatabase();

  if (process.env.QA_PEEK_AGG) {
    const { match, group, field } = JSON.parse(process.env.QA_PEEK_AGG) as {
      match?: Record<string, unknown>;
      group?: Record<string, unknown>;
      field?: string;
    };
    const stages: PipelineStage[] = [];
    if (match) stages.push({ $match: match });
    stages.push(
      field
        ? { $group: { _id: group ?? null, value: { $sum: `$${field}` }, docs: { $sum: 1 } } }
        : { $group: { _id: group ?? null, docs: { $sum: 1 } } },
    );
    const rows = await model.aggregate(stages).exec();
    console.log(`${modelName} aggregate -> ${JSON.stringify(redact(rows))}`);
    await disconnectDatabase();
    return;
  }

  const docs = (await model.find(filter, projection).limit(limit).lean().exec()) as Record<string, unknown>[];
  const total = await model.countDocuments(filter).exec();

  console.log(`${modelName}: ${total} document(s) match, printing ${docs.length}`);
  console.log(JSON.stringify(redact(docs), null, 2));
  await disconnectDatabase();
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
