# Production deployment guide

Scope: how the storefront (`flower-shop-front`) and the API (`flower-shop-back`)
run in production, and what an operator must provide. Written for the E5 hardening
checkpoint; it documents the deployment path, not new application behaviour.

## 1. Architecture

```
browser ──TLS──► reverse proxy (terminates TLS, forwards X-Forwarded-For)
                     │  /                → web  :3000
                     │  /api, /_next/image → api :5000
       ┌─────────────▼──────────┐   ┌──────────────▼─────────────┐
       │ web  (Next.js 15, node │   │ api (Express, node user)   │
       │ user, PID 1 = node)    │   │ stateless                  │
       └────────────────────────┘   └───────┬───────────┬────────┘
                                            │           │
                                  MongoDB Atlas      Cloudinary
                                  (system of record) (media)
```

* Both services are **stateless containers** — no volumes, no database container.
  Data lives in Atlas, media in Cloudinary, logs go to stdout.
* Images are built from the two repositories; `compose.yaml` (this repository) wires
  them together and is the supported way to run them.
* The storefront's API base URL and canonical site URL are **compiled into the client
  bundle**, so changing them means rebuilding the `web` image.

## 2. Prerequisites

| Requirement | Notes |
|---|---|
| Docker Engine + Compose v2 | `docker compose` (not the legacy `docker-compose` binary) |
| MongoDB Atlas cluster | TLS (`mongodb+srv://`) or `?tls=true`; `MONGODB_TLS=disabled` only for a private-network database |
| Cloudinary account | Optional: the API boots without credentials and warns; admin uploads then fail |
| TLS-terminating reverse proxy | Terminates HTTPS and forwards one proxy hop |
| Sibling checkout of the storefront | `compose.yaml` builds `../flower-shop-front` |
| Node.js 22 + npm (build host/CI) | Only needed for `db:indexes`, seeding and local builds — the runtime images do not ship dev tooling |

## 3. Environment variables

Copy `flower-shop-back/.env.example` and populate it; the API validates the file at
boot and refuses to start on unsafe values (messages name the variable, never its
value). `.env` and every `.env.*` file are gitignored; only `.env.example` is tracked.

| Variable | Service | Purpose / production rule |
|---|---|---|
| `NODE_ENV` | api | Must be `production` in a deployment (compose sets it) |
| `PORT` | api | Container port; `5000` by default |
| `API_PREFIX` | api | Defaults to `/api`; must match the proxy's path routing |
| `CORS_ORIGINS` | api | Comma-separated allowlist of storefront origins. `*` is refused in production |
| `MONGODB_URI` | api | Atlas connection string. Must be `mongodb+srv://` or carry `?tls=true` |
| `MONGODB_DB` | api | Database name to operate on |
| `MONGODB_TLS` | api | `disabled` opts out of the encryption requirement (private network only) |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | api | Two independent random strings, ≥32 characters, must differ |
| `JWT_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | api | Duration strings (`15m`, `30d`) |
| `COOKIE_DOMAIN` | api | Must match the public storefront host |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | api | Upload credentials |
| `CLOUDINARY_FOLDER` | api | Root folder for uploads (multi-site separation) |
| `CURRENCY`, `CURRENCY_SYMBOL`, `PARCEL_FEE`, `FREE_PARCEL_THRESHOLD`, `QUICK_FEE`, `RURAL_SURCHARGE` | api | Commerce configuration |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | api | Bootstrap admin. The development pair is refused in production; password ≥16 characters |
| `SEED_IMAGE_EXT` / `SEED_IMAGE_SOURCE` | api | Seeded artwork source; a deployment wants `cloudinary` |
| `NEXT_PUBLIC_API_URL` | web | **Build arg**: public API base (e.g. `https://shop.example.com/api`). Required |
| `NEXT_PUBLIC_SITE_URL` | web | **Build arg**: public storefront origin for canonical/OG URLs. Required |

## 4. Secret injection

1. Nothing secret is committed: `.env` and `.env.*` are ignored in both repositories,
   and the backend `.dockerignore` keeps `.env*` out of every image layer.
2. Provide values through the deployment environment: the API reads its `.env` file via
   `env_file` in `compose.yaml` (kept on the host, mode-restricted) or through your
   orchestrator's secret store if you move beyond Compose.
3. Generate production secrets with a CSPRNG, e.g. `openssl rand -base64 48`, and set
   both JWT secrets independently.
4. Rotating a JWT secret invalidates every issued access/refresh token, so rotate
   during a maintenance window.
5. Never place `NEXT_PUBLIC_*` values in a secret store: they are public by definition
   and end up in the browser bundle.

## 5. Build and run

```bash
cd flower-shop-back
export NEXT_PUBLIC_API_URL=https://shop.example.com/api
export NEXT_PUBLIC_SITE_URL=https://shop.example.com
docker compose build          # the web build fails fast if either public URL is missing
docker compose up -d
docker compose ps             # both services must reach "healthy"
docker compose logs -f api    # API logs are JSON lines on stdout
```

The `web` image must be rebuilt whenever one of the two public URLs changes, because
they are inlined into the client bundle at build time.

## 6. Health endpoints

| Probe | Service | Meaning |
|---|---|---|
| `GET /api/health` | api | the process is serving. It answers from memory and does not touch the database, so an unreachable Atlas shows up as a degraded API in the logs rather than as an unhealthy container |
| `GET /hy` | web | the Next.js server answers; the page is prerendered, so it does not depend on the API |

Both images carry a `HEALTHCHECK`, and `compose.yaml` adds `depends_on: service_healthy`
so the storefront waits for the API. Gate proxy traffic on the same health.

## 7. Index bootstrap

* The API never creates indexes outside development (`autoIndex` is off when
  `NODE_ENV=production`), so a fresh database needs one explicit step.
* Run `npm run db:indexes` **once per database** from a machine that can reach Atlas and
  has the repository installed — it is idempotent (it reports created/dropped counts and
  verifies unique keys) and safe to repeat after a release that changes indexes.
* The runtime images deliberately do not ship `tsx`, so this is a build-host/CI step, not
  a container command.

## 8. Seed policy

* `npm run seed` is additive: it upserts catalogue/content and creates the admin when
  absent. Safe to repeat; it never deletes.
* `npm run seed:fresh` deletes every seeded collection first. In production it
  **refuses to run without `--yes`** — and it refuses *before* connecting to the
  database — and it logs a DESTRUCTIVE RUN warning when it is allowed through.
* The demo customer with the published password is never seeded when
  `NODE_ENV=production`.
* Never run a destructive seed without a verified backup (see §9).

## 9. Backups and PITR responsibility

* Atlas is the system of record: enable Atlas continuous backups / point-in-time restore
  on the production cluster and record the retention window. That is the production
  restore path.
* `npm run db:backup` / `npm run db:restore` in this repository are **local-development
  tools**: they refuse `mongodb+srv`, credentialed URIs and system databases by design, so
  they cannot be aimed at Atlas. They exist to snapshot a disposable local database.
* Cloudinary media is external state as well: rely on the account's retention behaviour
  or export the media library periodically.

## 10. Rollback

1. **Application** — redeploy the previous image tag (`docker compose up -d` with the
   earlier `anahit-flower-api` / `anahit-flower-web` images) or `git revert` the
   offending commit and rebuild. Start-up runs no migrations, so an application rollback
   needs no database work.
2. **Database** — there are no down-migrations; recover a bad data change from an Atlas
   snapshot/PITR restore.
3. **Secrets** — a JWT secret rotation is not undone by redeploying: tokens minted with
   the new secret stop working if you roll the secret back.
4. **Verify after any rollback** — `/api/health` returns 200, the storefront renders,
   admin login succeeds, and one order lookup works.

## 11. Verification status (E5 checkpoint)

Verified on the build host: backend typecheck/build, backend smoke, security-check,
frontend typecheck/build, frontend SSR route smoke, Dockerfile and compose source review,
`compose.yaml` YAML syntax, and the seed guard behaviour.

**BLOCKED — no container engine on the build host** (no Docker, no Podman, no WSL
distribution): image builds, image size, non-root execution inside a container,
HEALTHCHECK transitions, SIGTERM/graceful shutdown, capability and limit enforcement,
and end-to-end traffic through a proxy. Run these first once an engine exists:

```bash
docker compose build
docker compose up -d
docker compose ps                                                     # expect healthy
docker inspect --format '{{.Config.User}}' anahit-flower-web:local     # expect: node
docker exec <web-container> id -u                                      # expect: 1000
docker stop -t 10 <web-container>                                      # clean exit, no SIGKILL
```

Deferred to later checkpoints: Next.js 16 migration, CI/CD, base-image digest pinning,
`images.remotePatterns` narrowing, network/egress policy, `cap_drop: [ALL]` verification,
observability platform, backend image layer optimisation.

