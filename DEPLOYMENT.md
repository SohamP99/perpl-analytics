# Cloud deployment: Vercel + Google Starter Tier

Constraint: no billing account or paid upgrade. Frontend: Vercel Hobby. Backend: Google AI Studio Starter Tier with PostgreSQL. Scheduler: a free external HTTP scheduler.

## Current status

The frontend, server proxy, PostgreSQL backend, bounded update job and historical seed are implemented and locally tested. They have not yet been verified on a deployed Google service. The imported AI Studio app may contain automatic rewrites; do not sync those over the tested source or accept an in-memory database fallback.

The bundled, checksummed `cloud/seed.json.gz` contains public blockchain summaries and liquidation details, not credentials or wallet-search caches. It is under 1 MB compressed. On first startup it imports transactionally into an empty database. Later starts retain the cloud checkpoint and never replace cloud history with this seed. Existing local SQLite files remain untouched. `cloud/seed-manifest.json` records the precise exported checkpoint and row counts.

## 1. Google backend

1. Import this repository into AI Studio Build using Add files (+) → Import from GitHub. If you imported an earlier revision, pull the current GitHub code before configuring deployment. The supported backend is `cloud/server.mjs`, not a generated Next.js API replacement.
2. In **Cloud SQL & Auth**, enable a **Cloud SQL PostgreSQL database under Starter Tier**. This is a managed developer instance with 1 GB storage. Do not import a billing-enabled project or upgrade. Review any account terms yourself.
3. Use the database connection provided by that integration. The backend accepts the standard `DATABASE_URL`, or PostgreSQL's `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, and `PGDATABASE` environment variables. Google-specific connection configuration must be verified in the provisioned app; do not invent a hostname or database password. Never disable certificate validation to make a connection succeed.
4. Use Node 24 and startup command **`npm run start:cloud`**. The checked-in Dockerfile also starts this backend and listens on the platform's `PORT` at `0.0.0.0`. It uses PostgreSQL and never opens the old raw SQLite index.
5. Configure server-only variables below. Generate two independent application tokens locally with `node scripts/create-cloud-secrets.mjs`; it creates an ignored `.env.cloud` without printing secrets. Copy values into hosting secrets, never into prompts, commits or chat.

| Backend variable | Value / purpose |
| --- | --- |
| `DATABASE_URL` or the `PG*` variables | Provisioned Starter Tier PostgreSQL connection |
| `PERPL_BACKEND_TOKEN` | Generated read token; also set on Vercel |
| `PERPL_JOB_TOKEN` | Different generated token, used only by the scheduler |
| `ENVIO_API_TOKEN` | Existing HyperSync token from local `.env` |
| `PERPL_LIVE_RPC_URL` | `https://rpc.monad.xyz`, or a suitable authenticated Monad read endpoint |
| `SPECTRUM_ENDPOINT` | Optional existing Spectrum endpoint; event-read fallback if HyperSync is not configured |
| `SPECTRUM_MODE` | Optional `rpc` or `api`, matching that endpoint |

`PERPL_BACKEND_URL` belongs in Vercel, not the Google backend. `PERPL_DATA_DIR` and `PERPL_STORAGE_LIMIT_GB` belong to the local indexer and are not used by the cloud service. Do not fill them merely because AI Studio inferred them from local development code.

6. Choose Publish → Get started → Publish app under Starter Tier. Stop if asked to enable billing. Save the backend HTTPS origin from the deployment result.
7. Verify `GET /healthz`, an authenticated `GET /api/local/protocol`, and `POST /jobs/refresh`. The read and job routes require different Bearer tokens. Confirm imported totals and checkpoint persistence after a restart before switching users to the cloud deployment.

## 2. Vercel frontend

1. Import `SohamP99/perpl-pulse` into a Vercel Hobby project.
2. Framework preset: **Other**. Root: repository root. Node: **24**.
3. `vercel.json` configures `npm ci`, `node scripts/build-web.mjs`, and output directory `web-dist`.
4. Set **server-only** environment variables:
   - `PERPL_BACKEND_URL`: Google backend HTTPS origin, with no path or query.
   - `PERPL_BACKEND_TOKEN`: same read token configured on Google.
5. Deploy. The build intentionally fails when backend configuration is absent. Provider secrets and database credentials never belong in Vercel's browser bundle. Use the free `vercel.app` URL.

## 3. Automatic updates

Create a free scheduled job, for example on cron-job.org:

- URL: `<Google backend origin>/jobs/refresh`
- Method: **POST**
- Header: `Authorization: Bearer <PERPL_JOB_TOKEN>`
- Schedule: every **5 minutes**, even with no dashboard open.

The service processes verified complete pages with a 20-second network budget, commits progress transactionally, and returns before the scheduler's 30-second limit in normal operation. A database lease prevents overlapping writers. Provider cooldowns, hash mismatches and storage limits retain the checkpoint. No work is intentionally deferred until after the HTTP response. Cloud cold-start time and provider latency must be measured after deployment; scheduling alone does not guarantee catch-up.

Public market snapshots refresh during jobs. API, candle, funding, leaderboard and wallet reads also use five-minute caches and refresh when requested. Source failures retain prior values with stale status. No Dune API calls are made. PostgreSQL storage pauses indexing at an 800 MiB safety threshold; Starter Tier capacity is finite.

## Verification already performed

- Fresh exported installation, frontend build, proxy tests and TypeScript checks.
- Complete seed import into embedded PostgreSQL (PGlite), matching SQLite daily history and totals.
- Exact large-integer amounts, atomic checkpoint updates, duplicate rejection, writer lease and persisted cooldown tests.
- Separate read/job authentication, read-only paths and resumed checkpoint tests.
- A live disposable-data test processed 1,164 blocks in approximately 3.5 seconds and reached its confirmed head. This local sample is not a guarantee for Google-hosted throughput.

Run `npm run test:cloud` for PostgreSQL tests. `node scripts/check-cloud-batch.mjs` tests one live provider batch against a disposable database; it never changes the installed SQLite or cloud history. Run `node scripts/export-cloud-seed.mjs` only when intentionally producing a newer seed for a fresh deployment. A seed never overwrites an initialized cloud database.

## Official references

- [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing): Hobby cron cannot provide five-minute scheduling.
- [SQLite on Vercel](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel): local serverless files are not durable storage.
- [AI Studio deployment](https://ai.google.dev/gemini-api/docs/aistudio-deploying)
- [AI Studio GitHub import](https://ai.google.dev/gemini-api/docs/aistudio-build-mode)
- [Cloud SQL with AI Studio](https://docs.cloud.google.com/sql/docs/postgres/ai-assisted-coding-and-cloud-sql)
- [Starter Tier supported resources](https://docs.cloud.google.com/docs/starter-tier)
- [cron-job.org limits](https://cron-job.org/en/faq/)
