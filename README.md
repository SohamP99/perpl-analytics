# Perpl Pulse

Protocol analytics and public wallet intelligence for Perpl on Monad. React and TypeScript frontend with a Node.js data service.

## Current capabilities

- Protocol volume, open interest, capital flows, fees, account growth, market and funding views.
- Daily, weekly and monthly charts, with an optional cumulative line.
- Public address lookup for current margin and positions, plus Perpl leaderboard performance.
- Dark and light themes; responsive layouts.
- Historical Dune CSV summaries, extended by HyperSync/RPC. No recurring Dune API queries.
- Five-minute refresh targets with visible source timestamps and stale-data status.

History begins in February 2026. Historical summary coverage and liquidation detail coverage differ; the UI reports partial coverage rather than treating missing rows as zero.

## Run locally

Use Node.js 24 (minimum 22.13):

```sh
npm ci
npm run dev:local
```

The launcher prints and opens a verified localhost URL. Its process must stay open. Server secrets belong in a local `.env`, which is excluded from Git. A new checkout does not contain the installed computer's databases or imported summaries. The original computer retains those files.

## Hosting status

The Vercel frontend, read-only proxy, PostgreSQL backend and bounded refresh job are implemented and locally tested. The cloud services are **not yet deployed and verified**. Use the cloud startup command in the deployment guide; do not deploy the local SQLite launcher on an ephemeral filesystem.

See [DEPLOYMENT.md](DEPLOYMENT.md) for the deployment order and required configuration. Vercel builds intentionally refuse to publish without backend configuration.

## Validation

```sh
node scripts/build-web.mjs
node tests/web-proxy.mjs
npm run test:cloud
npx tsc --noEmit
```

## Project layout

- `components/`, `hooks/`, `lib/`: dashboard and data presentation.
- `indexer/`: decoding, current wallet reads, aggregate storage and incremental indexing.
- `cloud/`: PostgreSQL backend, authenticated refresh job and checksummed historical seed.
- `scripts/local-dashboard.mjs`: installed local server.
- `scripts/build-web.mjs`, `api/proxy.mjs`, `vercel.json`: Vercel frontend deployment.
- `tests/`: data integrity and dashboard verification.
- `docs/local-development-history.md`: earlier implementation notes; some sections describe superseded functionality.

No credentials or local database files are included. The compact cloud seed includes public blockchain aggregates and event details, without wallet-search caches. Wallet connections and user API keys are not required for public wallet reads. Monetary values assume AUSD equals one USD; liquidation prices are estimates.
