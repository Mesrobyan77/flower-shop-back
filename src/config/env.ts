import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const num = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : Number(v)))
    .pipe(z.number().finite());

/** A production secret has to be long enough that guessing it is not a strategy. */
const PROD_SECRET_MIN_LENGTH = 32;
/** The placeholder shipped in .env.example must never secure a real deployment. */
const EXAMPLE_SECRETS = new Set(['change-me-to-a-long-random-string']);

/**
 * The development demo admin pair. Handy on a laptop, catastrophic on a live
 * shop: production refuses both values at boot and demands an explicit pair the
 * operator chose, so no code path can resolve a published password there.
 */
const DEV_SEED_ADMIN_EMAIL = 'admin@anahit-flower.am';
const DEV_SEED_ADMIN_PASSWORD = 'Admin123!';
/** Bootstrap credentials a production deployment states for itself. */
const PROD_SEED_ADMIN_MIN_LENGTH = 16;

/** SRV URIs are TLS by default; a plain URI has to ask for it explicitly. */
function usesEncryptedTransport(uri: string): boolean {
  return uri.startsWith('mongodb+srv://') || /[?&](tls|ssl)=true/i.test(uri);
}

/**
 * `jsonwebtoken` accepts `ms` durations (`15m`, `2h`, `30d`). Anything else -
 * including a bare number whose unit is ambiguous - would only surface as a
 * crash on the first login, so the shape is pinned at boot instead.
 */
const TTL_PATTERN = /^(?:\d+[smhd])+$/;

const ttl = (fallback: string) =>
  z
    .string()
    .regex(TTL_PATTERN, 'must be a duration like 15m, 2h or 30d')
    .default(fallback);

/**
 * Production-only refinements. Everything the shop cannot safely infer is stated
 * here so a misconfigured deployment fails at boot instead of running with a
 * published secret, a plaintext database connection or credential-less CORS.
 * Messages name the variable but never echo its value.
 */
/**
 * Payment providers are optional integrations. Leaving every variable of a
 * provider empty simply removes it from checkout; filling in *some* of its
 * variables is a configuration mistake that would otherwise surface as a
 * mysterious runtime failure, so it fails loudly at boot instead. Silent
 * half-configuration is exactly what produces "paid" orders nobody can verify.
 */
function paymentProviderIssues(
  cfg: {
    NODE_ENV: string;
    APP_FRONTEND_URL: string;
    IDRAM_REC_ACCOUNT: string;
    IDRAM_SECRET_KEY: string;
    ARCA_USERNAME: string;
    ARCA_PASSWORD: string;
  },
  ctx: z.RefinementCtx,
) {
  const providers = [
    { name: 'Idram', keys: ['IDRAM_REC_ACCOUNT', 'IDRAM_SECRET_KEY'] as const },
    { name: 'ArCa', keys: ['ARCA_USERNAME', 'ARCA_PASSWORD'] as const },
  ];

  let anyEnabled = false;
  for (const provider of providers) {
    const filled = provider.keys.filter((key) => cfg[key].trim() !== '');
    if (filled.length === provider.keys.length) {
      anyEnabled = true;
      continue;
    }
    if (filled.length > 0) {
      for (const key of provider.keys) {
        if (cfg[key].trim() === '') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${provider.name} is partially configured - set all of ${provider.keys.join(', ')} or none of them`,
          });
        }
      }
    }
  }

  // A return URL pointing at the developer's laptop is a false return URL in
  // production: the shopper would land nowhere after paying. Only enforced
  // while an online provider is actually offered.
  if (cfg.NODE_ENV === 'production' && anyEnabled && /(^|\/\/)(localhost|127\.0\.0\.1)/.test(cfg.APP_FRONTEND_URL)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['APP_FRONTEND_URL'],
      message: 'must be the public storefront origin in production while online payments are enabled',
    });
  }
}

function productionIssues(
  cfg: {
    NODE_ENV: string;
    JWT_SECRET: string;
    JWT_REFRESH_SECRET: string;
    MONGODB_URI: string;
    MONGODB_TLS?: 'disabled';
    CORS_ORIGINS: string;
    SEED_ADMIN_EMAIL: string;
    SEED_ADMIN_PASSWORD: string;
  },
  ctx: z.RefinementCtx,
) {
  if (cfg.NODE_ENV !== 'production') return;

  for (const key of ['JWT_SECRET', 'JWT_REFRESH_SECRET'] as const) {
    const value = cfg[key];
    if (EXAMPLE_SECRETS.has(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: 'still holds the .env.example placeholder' });
    } else if (value.length < PROD_SECRET_MIN_LENGTH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `must be at least ${PROD_SECRET_MIN_LENGTH} characters in production`,
      });
    }
  }

  if (cfg.JWT_SECRET === cfg.JWT_REFRESH_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['JWT_REFRESH_SECRET'],
      message: 'must differ from JWT_SECRET in production',
    });
  }

  if (cfg.MONGODB_TLS !== 'disabled' && !usesEncryptedTransport(cfg.MONGODB_URI)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['MONGODB_URI'],
      message: 'must use mongodb+srv:// or ?tls=true in production (set MONGODB_TLS=disabled to opt out)',
    });
  }

  if (cfg.CORS_ORIGINS.split(',').some((origin) => origin.trim() === '*')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['CORS_ORIGINS'],
      message: 'must list explicit origins - "*" is not accepted while credentialed CORS is enabled',
    });
  }

  // A demo admin pair is a door with a published key. Production boots only
  // with an explicit bootstrap address and a password nobody has ever seen
  // shipped; when the variables are absent the development defaults fall
  // through here and are refused the same way.
  if (cfg.SEED_ADMIN_EMAIL === DEV_SEED_ADMIN_EMAIL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['SEED_ADMIN_EMAIL'],
      message: 'must be set explicitly in production (the development demo address is refused)',
    });
  }

  if (cfg.SEED_ADMIN_PASSWORD === DEV_SEED_ADMIN_PASSWORD) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['SEED_ADMIN_PASSWORD'],
      message: 'the development demo password must never reach production',
    });
  } else if (cfg.SEED_ADMIN_PASSWORD.length < PROD_SEED_ADMIN_MIN_LENGTH) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['SEED_ADMIN_PASSWORD'],
      message: `must be at least ${PROD_SEED_ADMIN_MIN_LENGTH} characters in production`,
    });
  }
}

const schema = z.object({
  PORT: num(5000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PREFIX: z.string().default('/api'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  MONGODB_DB: z.string().default('anahit_flower'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
  JWT_EXPIRES_IN: ttl('15m'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 chars'),
  JWT_REFRESH_EXPIRES_IN: ttl('30d'),
  COOKIE_DOMAIN: z.string().default('localhost'),

  // Media lives in Cloudinary. Left empty the API still boots on the seeded
  // local artwork; only admin uploads need real credentials.
  CLOUDINARY_CLOUD_NAME: z.string().default(''),
  CLOUDINARY_API_KEY: z.string().default(''),
  CLOUDINARY_API_SECRET: z.string().default(''),
  CLOUDINARY_FOLDER: z.string().default('anahit-flower'),

  CURRENCY: z.string().default('AMD'),
  CURRENCY_SYMBOL: z.string().default('\u058F'),
  PARCEL_FEE: num(1500),
  FREE_PARCEL_THRESHOLD: num(25000),
  QUICK_FEE: num(2500),
  RURAL_SURCHARGE: num(3000),

  // 'svg' uses the generated placeholder artwork; switch to 'jpg' once
  // scripts/fetch-seed-photos.mjs has pulled licensed photography.
  SEED_IMAGE_EXT: z.enum(['svg', 'jpg']).default('svg'),
  // 'local' serves the artwork from frontend/public; 'cloudinary' points the
  // catalogue at the uploads made by npm run seed:images.
  SEED_IMAGE_SOURCE: z.enum(['local', 'cloudinary']).default('local'),
  SEED_ADMIN_EMAIL: z.string().email().default(DEV_SEED_ADMIN_EMAIL),
  SEED_ADMIN_PASSWORD: z.string().default(DEV_SEED_ADMIN_PASSWORD),

  /**
   * Escape hatch for a database on a private network: 'disabled' lets a plaintext
   * mongodb:// URI through in production. Absent, production demands encryption.
   */
  MONGODB_TLS: z.enum(['disabled']).optional(),

  // Public origin of the storefront. Payment return URLs are built from this,
  // so it must be the address the shopper's browser can actually reach.
  APP_FRONTEND_URL: z.string().url().default('http://localhost:3000'),

  // Idram merchant interface: EDP_REC_ACCOUNT (merchant ID), the SECRET_KEY
  // Idram issues for checksum verification, and the hosted payment page.
  // SUCCESS_URL / FAIL_URL / RESULT_URL are registered on Idram's side.
  IDRAM_REC_ACCOUNT: z.string().default(''),
  IDRAM_SECRET_KEY: z.string().default(''),
  IDRAM_PAYMENT_URL: z.string().url().default('https://money.idram.am/payment.aspx'),

  // ArCa iPay REST (Compass Plus EPG). The test host is the default so a
  // development machine can never hit the live gateway by omission.
  ARCA_API_BASE_URL: z.string().url().default('https://ipaytest.arca.am:8445/payment/rest'),
  ARCA_USERNAME: z.string().default(''),
  ARCA_PASSWORD: z.string().default(''),
  // iPay expects the amount in the currency's minor denomination. AMD's minor
  // unit is the luma, so 1000 AMD is sent as 100000; a bank that settles in
  // whole drams sets this to 1.
  ARCA_AMOUNT_MULTIPLIER: z.enum(['1', '100']).default('100'),
}).superRefine((cfg, ctx) => {
  productionIssues(cfg, ctx);
  paymentProviderIssues(cfg, ctx);
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
  /**
   * Provider settings resolved once at boot. `enabled` is the only thing the
   * checkout surface consults: no credentials, no tab - and the API answers a
   * clear 503 instead of ever pretending a payment succeeded.
   */
  payments: {
    appFrontendUrl: parsed.data.APP_FRONTEND_URL.replace(/\/+$/, ''),
    idram: {
      enabled: parsed.data.IDRAM_REC_ACCOUNT.trim() !== '' && parsed.data.IDRAM_SECRET_KEY.trim() !== '',
      recAccount: parsed.data.IDRAM_REC_ACCOUNT.trim(),
      secretKey: parsed.data.IDRAM_SECRET_KEY.trim(),
      paymentUrl: parsed.data.IDRAM_PAYMENT_URL,
    },
    arca: {
      enabled: parsed.data.ARCA_USERNAME.trim() !== '' && parsed.data.ARCA_PASSWORD.trim() !== '',
      apiBaseUrl: parsed.data.ARCA_API_BASE_URL.replace(/\/+$/, ''),
      username: parsed.data.ARCA_USERNAME.trim(),
      password: parsed.data.ARCA_PASSWORD,
      amountMultiplier: Number(parsed.data.ARCA_AMOUNT_MULTIPLIER),
    },
  },
};

export type Env = typeof env;
