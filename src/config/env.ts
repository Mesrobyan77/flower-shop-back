import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? def : v === 'true' || v === '1'));

const num = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : Number(v)))
    .pipe(z.number().finite());

const schema = z.object({
  PORT: num(5000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PREFIX: z.string().default('/api'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  MONGODB_DB: z.string().default('anahit_flower'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 chars'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  COOKIE_DOMAIN: z.string().default('localhost'),

  MINIO_ENDPOINT: z.string().default('127.0.0.1'),
  MINIO_PORT: num(9000),
  MINIO_USE_SSL: bool(false),
  MINIO_ACCESS_KEY: z.string().default('minioadmin'),
  MINIO_SECRET_KEY: z.string().default('minioadmin'),
  MINIO_BUCKET: z.string().default('anahit-flower'),
  MINIO_PUBLIC_URL: z.string().default('http://127.0.0.1:9000'),

  CURRENCY: z.string().default('AMD'),
  CURRENCY_SYMBOL: z.string().default('\u058F'),
  PARCEL_FEE: num(1500),
  FREE_PARCEL_THRESHOLD: num(25000),
  QUICK_FEE: num(2500),
  RURAL_SURCHARGE: num(3000),

  // 'svg' uses the generated placeholder artwork; switch to 'jpg' once
  // scripts/fetch-seed-photos.mjs has pulled licensed photography.
  SEED_IMAGE_EXT: z.enum(['svg', 'jpg']).default('svg'),
  SEED_ADMIN_EMAIL: z.string().email().default('admin@anahit-flower.am'),
  SEED_ADMIN_PASSWORD: z.string().default('Admin123!'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // eslint-disable-next-line no-console
  console.error(`\nInvalid environment configuration:\n${issues}\n`);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === 'production',
  isDev: parsed.data.NODE_ENV === 'development',
  corsOrigins: parsed.data.CORS_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};

export type Env = typeof env;
