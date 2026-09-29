/* eslint-disable no-console */
/**
 * Backs up one MongoDB database to a real BSON dump using mongodump.
 *
 *   npm run db:backup -- --db=<name> [--out=<dir>]
 *
 * The dump lands in <dir>/<name>/ (default: .mongo-backups/<name>, git-ignored)
 * and holds one .bson file plus index metadata per collection - enough for
 * mongorestore to bring the database (documents AND indexes) back.
 *
 * Deliberately local-only and fail-closed so it can never become an accidental
 * production/Atlas data-exposure path:
 *   - the target must be a credential-free mongodb://127.0.0.1 or localhost URI;
 *     mongodb+srv, any other host and any credentials in the URI are refused
 *     without echoing their values;
 *   - the admin/local/config system databases are refused;
 *   - a dump folder that already exists is refused, so two runs can never mix
 *     into one directory;
 *   - mongodump is invoked with --host/--port/--db only - the connection string
 *     is never handed to a child process and never printed.
 *
 * Requires the MongoDB Database Tools (mongodump) on PATH.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env';

const SYSTEM_DATABASES = new Set(['admin', 'local', 'config']);

interface Args {
  db?: string;
  out?: string;
}

function parseArgs(): Args {
  const args: Args = {};
  for (const raw of process.argv.slice(2)) {
    if (!raw.startsWith('--')) {
      console.error(`db:backup refused: unexpected argument "${raw}" (expected --db=<name> [--out=<dir>])`);
      process.exit(2);
    }
    const [flag, value] = raw.slice(2).split('=');
    if (flag === 'db' && value) args.db = value;
    else if (flag === 'out' && value) args.out = value;
    else {
      console.error(`db:backup refused: unexpected argument "${raw}" (expected --db=<name> [--out=<dir>])`);
      process.exit(2);
    }
  }
  return args;
}

function refuse(message: string): never {
  console.error(`db:backup refused: ${message}`);
  process.exit(1);
}

/** Extract a printable, credential-free local target or refuse. */
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

function main() {
  const args = parseArgs();
  if (!args.db) refuse('--db=<name> is required - no database is ever assumed');
  const db = args.db;
  if (SYSTEM_DATABASES.has(db)) refuse(`"${db}" is a system database`);
  const target = localTarget(env.MONGODB_URI);

  const out = path.resolve(args.out ?? path.join('.mongo-backups', db));
  const dumpDir = path.join(out, db);
  if (fs.existsSync(dumpDir)) refuse(`dump folder already exists: ${dumpDir} - choose a fresh --out`);
  fs.mkdirSync(out, { recursive: true });

  console.log(`Backup target (local): ${target.host}:${target.port} / ${db}`);
  const run = spawnSync('mongodump', ['--host', target.host, '--port', target.port, '--db', db, '--out', out], { stdio: 'inherit' });
  if (run.error && (run.error as NodeJS.ErrnoException).code === 'ENOENT') {
    refuse('mongodump not found on PATH - install the MongoDB Database Tools');
  }
  if (run.status !== 0) {
    console.error(`db:backup failed: mongodump exited with code ${run.status}`);
    process.exit(run.status ?? 1);
  }

  const files = fs.existsSync(dumpDir) ? fs.readdirSync(dumpDir).filter((file) => file.endsWith('.bson')).sort() : [];
  if (files.length === 0) refuse('dump finished but holds no .bson files - not a usable backup');
  let bytes = 0;
  for (const file of files) bytes += fs.statSync(path.join(dumpDir, file)).size;
  console.log(`Backup written: ${dumpDir}`);
  console.log(`  ${files.length} BSON collection file(s), ${bytes} bytes total`);
  for (const file of files) console.log(`    ${file} (${fs.statSync(path.join(dumpDir, file)).size} bytes)`);
}

main();
