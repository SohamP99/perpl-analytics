# Perpl Pulse cloud backend

This branch contains only the Node.js data service. The frontend remains on the `main` branch and is deployed to Vercel.

Use this branch for Google AI Studio import. Do not convert it to Next.js, add mock data, or replace PostgreSQL with an in-memory database. It is a backend service, so its root URL displays a JSON health response rather than the dashboard.

1. Provision a Cloud SQL PostgreSQL database under Google Starter Tier without enabling billing.
2. Configure the provisioned database connection via `DATABASE_URL` or standard `PG*` variables.
3. Configure distinct random `PERPL_BACKEND_TOKEN` and `PERPL_JOB_TOKEN` values (at least 32 characters each), the existing `ENVIO_API_TOKEN`, and optionally `PERPL_LIVE_RPC_URL=https://rpc.monad.xyz`.
4. Run `npm ci` and `npm start` using Node 24. The server listens on the platform PORT (default 8080).
5. Publish under Starter Tier, then configure the Vercel frontend and the five-minute authenticated scheduler. See [DEPLOYMENT.md](DEPLOYMENT.md).

The checksummed seed is encoded as JSON so text-only importers preserve it. It contains public blockchain aggregates and event details, without secrets or wallet-search caches. PostgreSQL initializes from it only once, then resumes its own saved checkpoint after every restart.

Never replace GitHub main with AI Studio's automatic migration code. Neither local SQLite storage nor a process timer alone is a supported cloud deployment.
