# Free cloud deployment: Vercel + Supabase

The prepared deployment uses Vercel Hobby for the frontend and Node functions, Supabase Free PostgreSQL for durable data, and Supabase Cron for five-minute refresh requests. It does not require the development PC to stay on or make recurring Dune queries.

## Status

Source is on the private GitHub repository `SohamP99/perpl-pulse`, branch `main`. The app is deployed at https://perpl-pulse.vercel.app on Vercel Hobby. Supabase Free PostgreSQL is connected with verified TLS, the historical seed is imported, and a five-minute Supabase Cron job is enabled. Public protocol, market, and wallet endpoints return HTTP 200. An authenticated refresh processed seven batches and advanced the checkpoint by 11,517 blocks. The automatic Supabase run at 16:35 IST on 13 October 2026 returned HTTP 200 and caught up through block 113024260. The next run is scheduled five minutes later; no local computer is needed.

Google AI Studio's initial Get started screen was not proof of Starter eligibility. The actual publish flow asked to confirm a billing account. No Continue, paid upgrade or deployment was performed. Leave the old AI Studio environment-variable prompt unfilled. Do not force-push AI Studio's generated rewrite over the tested GitHub code.

## 1. Create a free database

1. Sign in at https://supabase.com/dashboard.
2. Create a project in a **Free** organization. Choose a region near the intended Vercel function region. Keep its database password private.
3. Open the project's **Connect** dialog. Choose **Transaction pooler**, which uses port **6543**. The backend uses transaction-scoped schema settings. Session pooling exhausted the free pool during concurrent dashboard requests; old saved Supabase pooler URIs are automatically routed to port 6543 by the backend.
4. Copy the PostgreSQL URI. Replace the password placeholder with your password, percent-encoding reserved characters. Use `sslmode=verify-full`; retain certificate verification. The backend includes Supabase's official public CA from the project's Database > SSL configuration and validates pooled connections with it.
5. The complete URI goes only into Vercel's `DATABASE_URL` secret. Do not share it in chat or commit it.

The backend creates a private `perpl` schema. Do not add that schema to Supabase's exposed Data API schemas. Its tables are accessed by the server, not browser Supabase keys.

## 2. Prepare secrets

Run `node scripts/create-cloud-secrets.mjs` locally. It creates an ignored `.env.cloud` with two independent random tokens, and refuses to overwrite an existing file. Copy values into Vercel's server environment settings without sending them in chat.

| Vercel variable | Value |
| --- | --- |
| `DATABASE_URL` | Supabase Transaction pooler URI with your database password and verified TLS |
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

The Supabase project supports pg_cron and pg_net, so no external scheduler account is needed. After verifying the production URL, configure the schedule once from the trusted local checkout:

```sh
node scripts/cloud-admin.mjs schedule https://YOUR-PROJECT.vercel.app
node scripts/cloud-admin.mjs status
```

The script loads the ignored `.env.cloud`, enables the scheduler/network extensions, stores the production origin and scheduler token in Supabase Vault, and creates or updates one named job (`perpl-pulse-refresh`) every five minutes. It sends an authenticated POST to `/api/refresh`. Credentials are not printed or embedded in cron command text. Run history is retained for seven days.

Vercel Hobby's built-in cron cannot supply a five-minute schedule. Supabase sends the request independently of dashboard visits or the development computer. The indexing request has a 20-second network budget, a 60-second function limit, and a 55-second scheduler HTTP timeout. A database lease prevents concurrent writers. Complete pages commit atomically; interrupted work resumes at the saved checkpoint. Do not enable a second external scheduler for the same deployment.

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

Run `npm run test:cloud`, `node tests/vercel-cloud.mjs`, and `node tests/web-proxy.mjs`. Hosted checks confirmed TLS connectivity, seed import, public protocol/market/wallet responses, rejection of unauthenticated refresh requests, a manual update and an automatic scheduled update. The database checkpoint is independent of Vercel deployments.

## References

- [Supabase Free pricing](https://supabase.com/pricing)
- [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Vercel function limits](https://vercel.com/docs/functions/limitations)
- [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Supabase Cron](https://supabase.com/docs/guides/cron)
- [Scheduling HTTP calls and Vault](https://supabase.com/docs/guides/functions/schedule-functions)
