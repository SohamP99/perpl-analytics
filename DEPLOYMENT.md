# Free cloud deployment: Vercel + Supabase

The prepared deployment uses Vercel Hobby for the frontend and Node functions, Supabase Free PostgreSQL for durable data, and cron-job.org for five-minute refresh requests. It does not require the development PC to stay on or make recurring Dune queries.

## Status

Source is on the private GitHub repository `SohamP99/perpl-pulse`, branch `main`. The Vercel adapter and PostgreSQL store are locally tested; a hosted database and deployment have not yet been connected or verified.

Google AI Studio's initial Get started screen was not proof of Starter eligibility. The actual publish flow asked to confirm a billing account. No Continue, paid upgrade or deployment was performed. Leave the old AI Studio environment-variable prompt unfilled. Do not force-push AI Studio's generated rewrite over the tested GitHub code.

## 1. Create a free database

1. Sign in at https://supabase.com/dashboard.
2. Create a project in a **Free** organization. Choose a region near the intended Vercel function region. Keep its database password private.
3. Open the project's **Connect** dialog. Choose **Session pooler**, which uses port **5432**. This implementation uses session state for its private schema; do not select the transaction pooler on port 6543.
4. Copy the PostgreSQL URI. Replace the password placeholder with your password, percent-encoding reserved characters. Use `sslmode=verify-full`; retain certificate verification. If a CA is needed, obtain the project's official CA rather than disabling verification.
5. The complete URI goes only into Vercel's `DATABASE_URL` secret. Do not share it in chat or commit it.

The backend creates a private `perpl` schema. Do not add that schema to Supabase's exposed Data API schemas. Its tables are accessed by the server, not browser Supabase keys.

## 2. Prepare secrets

Run `node scripts/create-cloud-secrets.mjs` locally. It creates an ignored `.env.cloud` with two independent random tokens, and refuses to overwrite an existing file. Copy values into Vercel's server environment settings without sending them in chat.

| Vercel variable | Value |
| --- | --- |
| `DATABASE_URL` | Supabase Session pooler URI with your database password and verified TLS |
| `PERPL_BACKEND_TOKEN` | Generated read token from `.env.cloud` |
| `PERPL_JOB_TOKEN` | Different generated scheduler token from `.env.cloud` |
| `ENVIO_API_TOKEN` | Existing HyperSync token from the local `.env` |
| `PERPL_LIVE_RPC_URL` | `https://rpc.monad.xyz`, or a suitable Monad endpoint |
| `PERPL_CLOUD_STORAGE_LIMIT_MB` | `400` (default; pauses indexing before the free database limit) |
| `SPECTRUM_ENDPOINT` | Optional Spectrum event-read fallback when HyperSync is not configured |
| `SPECTRUM_MODE` | Optional `rpc` or `api`, matching the Spectrum endpoint |

Do not set `PERPL_BACKEND_URL` for this all-Vercel deployment. `PERPL_DATA_DIR`, `PERPL_RPC_URL` and `PERPL_STORAGE_LIMIT_GB` are old local-launcher settings and are unnecessary here. Never prefix secrets with `NEXT_PUBLIC_` or `VITE_`.

## 3. Deploy on Vercel Hobby

1. Import `SohamP99/perpl-pulse`, branch `main`, into your personal **Hobby** account.
2. Framework preset: **Other**. Root directory: repository root. Node.js: **24**.
3. The checked-in `vercel.json` sets install to `npm ci`, build to `node scripts/build-web.mjs`, and output to `web-dist`.
4. Add the variables above to the **Production** environment. Preview deployments need their own database if enabled; do not casually point unreviewed branches at production.
5. Deploy using the included `vercel.app` address. Do not enable paid add-ons or upgrade plans.
6. Open `/api/local/protocol` once. Initial startup imports the checksummed historical seed into an empty database. Verify the dashboard's values and coverage before enabling the scheduler.

The seed is under 1 MB compressed and contains public chain aggregates, not the multi-gigabyte raw index. It imports in one transaction. Every later cold start or deployment retains the stored checkpoint and does not replace existing history. Local SQLite files are unchanged.

## 4. Schedule automatic updates

Create a free job at https://cron-job.org:

- URL: `https://YOUR-PROJECT.vercel.app/api/refresh`
- Method: **POST**
- Header: `Authorization: Bearer YOUR_PERPL_JOB_TOKEN`
- Schedule: every **5 minutes**

Enter the real scheduler token privately in the scheduler's custom header field, not in the URL. The read token cannot authorize indexing. Test the job once, inspect its JSON response, and confirm that the coverage advances. The deployment's production endpoint must be reachable by this scheduler; an authentication page in front of it will prevent execution.

Vercel Hobby's built-in cron only supports daily execution, so it cannot supply this schedule. The bounded indexing request has a 20-second network budget and the Vercel function a 60-second maximum. cron-job.org normally aborts after 30 seconds, so initialize the database first and measure hosted execution time. A database lease prevents concurrent writers. Provider cooldowns persist across deployments. Complete pages commit atomically before responding; interrupted work resumes from the last committed page.

Five minutes is a refresh target, not a guarantee: provider limits and backlog can cause stale data. API, candle, funding, leaderboard and wallet reads refresh their five-minute caches when requested; scheduled jobs also update public market snapshots. No Dune API is used.

## Limits and verification

Supabase Free includes 500 MB database storage and 5 GB egress and may pause inactive projects. The 400 MiB application guard pauses indexing and preserves the checkpoint; it does not increase any hosting quota. Free service limits can constrain traffic or availability. No paid plan or billing account is required for the proposed setup.

Verified locally:

- Frontend production build.
- Complete historical seed parity between SQLite and embedded PostgreSQL.
- Exact large integer amounts, transactional checkpoint updates, duplicate rejection, writer lease and durable retry cooldown.
- Private PostgreSQL schema and Vercel route rewriting.
- Public read routes, rejected mutations, and independent scheduler authentication.
- A disposable live-provider test processed 1,164 blocks in about 3.5 seconds. This is not a hosted performance guarantee.

Run `npm run test:cloud`, `node tests/vercel-cloud.mjs`, and `node tests/web-proxy.mjs`. Hosted verification must additionally confirm TLS connectivity, seed import, two scheduled updates, and checkpoint persistence after redeployment.

## References

- [Supabase Free pricing](https://supabase.com/pricing)
- [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Vercel function limits](https://vercel.com/docs/functions/limitations)
- [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [cron-job.org limits](https://cron-job.org/en/faq/)
