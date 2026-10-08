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
| `TRUST_PROXY_HOPS` | api | Hops in front of the API (`0` = direct). One TLS-terminating proxy is `1`; with `0` the rate limiter keys every visitor on the proxy's address |
| `CORS_ORIGINS` | api | Comma-separated allowlist of storefront origins. `*` is refused in production |
| `MONGODB_URI` | api | Atlas connection string. Must be `mongodb+srv://` or carry `?tls=true` |
| `MONGODB_DB` | api | Database name to operate on |
| `MONGODB_TLS` | api | `disabled` opts out of the encryption requirement (private network only) |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | api | Two independent random strings, ≥32 characters, must differ |
| `JWT_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | api | Duration strings (`15m`, `30d`) |
| `COOKIE_DOMAIN` | api | **Not applied.** The session and guest cookies are host-only on purpose, so a deployment cannot widen them to a whole registrable domain |
| `COOKIE_SAMESITE` | api | `lax` (default) \| `strict` \| `none`. See 3.1 - `none` is only for a storefront on a different registrable domain than this API |
| `COOKIE_SECURE` | api | `auto` (default, `Secure` iff `NODE_ENV=production`) \| `true` \| `false`. `false` is refused in production and with `COOKIE_SAMESITE=none` |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | api | Upload credentials |
| `CLOUDINARY_FOLDER` | api | Root folder for uploads (multi-site separation) |
| `CURRENCY`, `CURRENCY_SYMBOL`, `PARCEL_FEE`, `FREE_PARCEL_THRESHOLD`, `QUICK_FEE`, `RURAL_SURCHARGE` | api | Commerce configuration |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | api | Bootstrap admin. The development pair is refused in production; password ≥16 characters |
| `SEED_IMAGE_EXT` / `SEED_IMAGE_SOURCE` | api | Seeded artwork source; a deployment wants `cloudinary` |
| `NEXT_PUBLIC_API_URL` | web | **Build arg**: public API base (e.g. `https://shop.example.com/api`). Required |
| `NEXT_PUBLIC_SITE_URL` | web | **Build arg**: public storefront origin for canonical/OG URLs. Required |

## 3.1 Sessions when the storefront and the API are on different hosts

The storefront keeps the access token in memory and sends it as `Authorization: Bearer`.
The refresh token never enters JavaScript: it lives in the HttpOnly `xf_refresh`
cookie, and the browser attaches it to `POST /api/auth/refresh`. So the refresh
request is the one place where cookie rules, not code, decide the outcome.

`netlify.app` and `onrender.com` are two different registrable domains, which makes
every storefront-to-API request *cross-site*. A `SameSite=Lax` cookie is not attached
to a cross-site `fetch`, so this combination fails in a very specific way:

| Call | Result | Why |
|---|---|---|
| `POST /api/auth/login` | 200 | the response header is not the problem; the request carries no cookie |
| `GET /api/auth/me` | 200 | the access token is a header, unaffected by cookie rules |
| `POST /api/auth/refresh` | 401 `No refresh token supplied` | the browser will not send a `Lax` cookie cross-site, and the body deliberately carries no token |

The session therefore works until the access token expires (`JWT_EXPIRES_IN`, 15m by
default), and the shopper is then silently logged out. Guest baskets break the same
way, because `xf_sid` follows the identical policy.

Two supported shapes:

**A. Same-site (recommended).** Serve the API under the storefront's own origin, so
the browser sees one site and `SameSite=Lax` is enough. On Netlify that is a proxy
rewrite (`/api/*` to the Render URL) plus a storefront build with
`NEXT_PUBLIC_API_URL=/api`; the API's SSR-side base URL has to stay absolute, so this
shape needs the storefront's client and server bases split before it can be switched
on. `CORS_ORIGINS` then no longer matters for the browser, and the cookies are
first-party - which is what keeps them working in browsers that block third-party
cookies.

**B. Cross-site, cookies allowed to travel.** Set `COOKIE_SAMESITE=none` on the API.
`None` is refused without `Secure` at boot, and the policy forces `Secure`, so the
cookies only ever move over TLS. `CORS_ORIGINS` must list the storefront origin
exactly (`*` is refused while credentialed CORS is on), and the storefront must keep
sending `withCredentials`. Limitation to state plainly: browsers tightening
third-party cookie rules can still drop these cookies for some visitors, which is
why shape A is the durable answer rather than a nice-to-have.

Nothing here touches token validation, rotation or revocation: it only decides how an
already-valid token is allowed to travel. `npm run cookie:policy-tests` pins the rules
(`HttpOnly` and `Path=/` are not configurable, no cookie is ever given a `Domain`,
`None` never appears without `Secure`, contradictory configuration fails at boot), and
`npm run refresh:tests` asserts the same attributes on the wire.

| Setting | Value | Note |
|---|---|---|
| `NODE_ENV` | `production` | Without it the API is a development process: cookies lose `Secure`, request logging stays on, and a 5xx can carry a stack. A response with `SameSite=Lax` and no `Secure` is the observable symptom |
| `COOKIE_SAMESITE` | `none` | Only for shape B |
| `COOKIE_SECURE` | `auto` | Leave alone; `None` forces `Secure` regardless |
| `CORS_ORIGINS` | the storefront origin, exact | A refused origin answers 403 and is never echoed back |
| `TRUST_PROXY_HOPS` | `1` | Both hosts terminate TLS in front of the app; with `0` the rate limiter keys every visitor on one proxy address |

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

### 6.1 Platform health-check path

`GET /` and `HEAD /` on the API answer **404 by design** — every route, including
`/health`, mounts under `API_PREFIX` (`/api`), and the service has no root handler; the
storefront owns `/` behind the proxy. The 404 body is the generic
`{"success":false,"message":"Route GET / does not exist","code":"NOT_FOUND"}` produced by
`notFoundHandler`, logged at `warn`. It is not a failure and must not be "fixed" by adding
a root route, which would put a second, unversioned surface in front of the API.

A PaaS that probes `/` therefore sees a 404 while still reporting the deploy as live,
because liveness and the probe are different mechanisms. On Render the default check is a
TCP socket probe to the exposed port, which succeeds as soon as the process binds; the HTTP
check is only used when a path is configured, it is issued with `GET`, and it counts the
instance healthy on any `2xx`/`3xx` within five seconds (a persistent failure restarts the
service, and a deploy that never becomes ready fails after 15 minutes). So:

| Setting | Value | Why |
|---|---|---|
| Render dashboard → Health Check Path | `/api/health` | the only API route that answers 200 without a database round-trip |
| `render.yaml` (blueprint, if used) | `healthCheckPath: /api/health` | same, declared as code; no blueprint file is in this repository, so today this is a dashboard setting |
| `API_PREFIX` | must stay `/api` | the probe path is `${API_PREFIX}/health`; the container `HEALTHCHECK` builds it from the same variable |

Health probes share the `apiLimiter` (per-minute, per-client) with every other API route, so
keep the probe interval at seconds, not sub-second, and set `TRUST_PROXY_HOPS` to the real
number of proxies so the limiter keys on the client rather than on the whole platform.
`/api/health` reports `status` and `uptime` only — never configuration, credentials or
connection strings.

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

