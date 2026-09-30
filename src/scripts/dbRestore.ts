/* eslint-disable no-console */
/**
 * DESTRUCTIVE: restores one MongoDB database from a mongodump folder.
 *
 *   npm run db:restore -- --db=<name> --dir=<dump-dir> --yes [--drop]
 *
 *   --dir may be the dump root (the folder that contains <name>/) or the
 *   <name>/ folder itself; --yes is mandatory because restoring replaces data
 *   in the target; --drop lets mongorestore drop each existing collection
 *   before recreating it (without it a non-empty target is refused).
 *
 * Safety rules - identical to db:backup, plus the restore-specific ones:
 *   - only a credential-free local mongodb://127.0.0.1/localhost URI is
 *     accepted; mongodb+srv, remote hosts and credential-bearing URIs are
 *     refused without echoing values, so a production database can never be
 *     the target of a destructive restore;
 *   - admin/local/config system databases are refused;
 *   - the dump folder must actually contain .bson files;
 *   - without --yes the run stops before touching anything;
 *   - mongorestore is invoked with --host/--port/--db/--dir only - the
 *     connection string is never handed to a child process or printed.
 *
 * Requires the MongoDB Database Tools (mongorestore) on PATH.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import mongoose from 'mongoose';
import path from 'node:path';
import { env } from '../config/env';

const SYSTEM_DATABASES = new Set(['admin', 'local', 'config']);

interface Args {
  db?: string;
  dir?: string;
  yes: boolean;
  drop: boolean;
}

function parseArgs(): Args {
  const args: Args = { yes: false, drop: false };
  for (const raw of process.argv.slice(2)) {
    if (raw === '--yes') { args.yes = true; continue; }
    if (raw === '--drop') { args.drop = true; continue; }
    if (!raw.startsWith('--')) {
      console.error(`db:restore refused: unexpected argument "${raw}"`);
      process.exit(2);
    }
    const [flag, value] = raw.slice(2).split('=');
    if (flag === 'db' && value) args.db = value;
    else if (flag === 'dir' && value) args.dir = value;
    else {
      console.error(`db:restore refused: unexpected argument "${raw}" (expected --db=<name> --dir=<dir> --yes [--drop])`);
      process.exit(2);
    }
  }
  return args;
}

function refuse(message: string): never {
  console.error(`db:restore refused: ${message}`);
  process.exit(1);
}

function localTarget(uri: string): { host: string; port: string } {
  if (uri.startsWith('mongodb+srv://')) {
    refuse('MONGODB_URI is an mongodb+srv (remote cluster) target - this tool only accepts local ones');
  }
  const match = uri.match(/^mongodb:\/\/([^/?]+)/);
  if (!match) refuse('MONGODB_URI is not a mongodb:// URI');
  const authority = match[1];
  if (authority.includes('@')) {
    refuse('MONGODB_URI carries credentials - a credential-free local URI is required (credentials are never printed or passed along)');
  }
  const local = authority.match(/^(127\.0\.0\.1|localhost)(?::(\d+))?$/);
  if (!local) refuse('MONGODB_URI is not a local target (127.0.0.1/localhost) - refusing to touch a remote database');
  return { host: local[1], port: local[2] ?? '27017' };
}

async function main() {
  const args = parseArgs();
  if (!args.db) refuse('--db=<name> is required - no database is ever assumed');
  const db = args.db;
  if (SYSTEM_DATABASES.has(db)) refuse(`"${db}" is a system database`);
  if (!args.dir) refuse('--dir=<dump-dir> is required');
  if (!args.yes) refuse('--yes is required: restoring replaces data in the target database (destructive)');
  const target = localTarget(env.MONGODB_URI);

  const dir = path.resolve(args.dir);
  const nested = path.join(dir, db);
  const dbDir = fs.existsSync(nested) && fs.lstatSync(nested).isDirectory() ? nested : dir;
  const bsons = fs.existsSync(dbDir) ? fs.readdirSync(dbDir).filter((file) => file.endsWith('.bson')) : [];
  if (bsons.length === 0) refuse(`no .bson files found in ${dbDir} - not a mongodump folder for "${db}"`);

  await mongoose.connect(env.MONGODB_URI, { dbName: db, serverSelectionTimeoutMS: 8000 });
  const connectionDb = mongoose.connection.db;
  if (!connectionDb) refuse(`could not open target database "${db}"`);
  const existing = (await connectionDb.listCollections().toArray()).map((row) => row.name);
  await mongoose.disconnect();

  const willDrop = args.drop && existing.length > 0;
  if (existing.length > 0 && !willDrop) {
    refuse(`target "${db}" is not empty (${existing.length} collection(s)) - restore would fail halfway; drop it first or pass --drop`);
  }

  console.log(`Restore target (local): ${target.host}:${target.port} / ${db}`);
  console.log(`  source:  ${dbDir} (${bsons.length} BSON file(s))`);
  console.log(`  target state: ${existing.length === 0 ? 'empty' : `${existing.length} collection(s)${willDrop ? ' - will be dropped first (--drop)' : ''}`}`);

  const mongorestoreArgs = ['--host', target.host, '--port', target.port, '--db', db, '--dir', dbDir];
  if (willDrop) mongorestoreArgs.push('--drop');
  const run = spawnSync('mongorestore', mongorestoreArgs, { stdio: 'inherit' });
  if (run.error && (run.error as NodeJS.ErrnoException).code === 'ENOENT') {
    refuse('mongorestore not found on PATH - install the MongoDB Database Tools');
  }
  if (run.status !== 0) {
    console.error(`db:restore failed: mongorestore exited with code ${run.status}`);
    process.exit(run.status ?? 1);
  }
  console.log(`Restored ${bsons.length} collection file(s) of "${db}" from ${dbDir}`);
}

main().catch((err) => {
  console.error(`db:restore failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

