/* Minimal structured logger — no external dependency, JSON in production. */
import { env } from './env';

type Level = 'debug' | 'info' | 'warn' | 'error';

const COLORS: Record<Level, string> = {
  debug: '\x1b[90m',
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
};

function emit(level: Level, message: string, meta?: unknown) {
  const time = new Date().toISOString();
  if (env.isProd) {
    process.stdout.write(`${JSON.stringify({ time, level, message, meta })}\n`);
    return;
  }
  const color = COLORS[level];
  const tail = meta === undefined ? '' : ` ${typeof meta === 'string' ? meta : JSON.stringify(meta)}`;
  process.stdout.write(`${color}[${level.toUpperCase()}]\x1b[0m ${time} ${message}${tail}\n`);
}

export const logger = {
  debug: (m: string, meta?: unknown) => env.isDev && emit('debug', m, meta),
  info: (m: string, meta?: unknown) => emit('info', m, meta),
  warn: (m: string, meta?: unknown) => emit('warn', m, meta),
  error: (m: string, meta?: unknown) => emit('error', m, meta),
};
