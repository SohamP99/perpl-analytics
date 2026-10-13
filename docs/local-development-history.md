# October 13: automatically refreshable metrics only

Close the old launcher and reopen **Start Perpl Pulse.cmd**. The dashboard no longer displays the saved TPS, hourly transactions, peak TPS or MON emission/burn metrics. The Network activity tab and its snapshot endpoint are removed.

Historical Dune summaries remain the starting baseline for fees, flows, users, fills and liquidations; new HyperSync/RPC events extend them automatically. Market data, candles, funding and leaderboard data refresh through the Perpl API. Wallet balances and positions refresh through contract reads. The backend must remain running. Provider delays retain saved values and appear in Data status; a refresh schedule does not guarantee the indexer has caught up.

There are no recurring Dune queries or Dune API calls. Offline source files are retained for reference and are not connected to the dashboard.

---

# Perpl Pulse — local development

**Spectrum Business integration:** see [SPECTRUM.md](SPECTRUM.md) for local setup, provider selection, concurrency and validation. Spectrum takes precedence over the free sources below once configured.

Run the dashboard, public wallet reader and historical indexer on this computer. No hosting account, subscription, wallet connection or Perpl API key is required. Public RPC requests use your internet connection and local disk space; no blockchain transactions are submitted.

## Start

On this installed Windows copy, double-click `Start Perpl Pulse.cmd` in the outputs folder. Close the previous launcher window first. Keep the new window open. The launcher chooses a free port, verifies HTTP and opens the browser. Do not reuse an old bookmarked localhost port.

From this source directory: `npm run dev:local`. A fresh source checkout needs Node 22.13+ (tested with 24.12) and `npm ci` first. The installed copy already has its dependencies.

The launcher starts all three local pieces together: the web server, the indexer and SQLite storage. SQLite requires no separate installation. Closing the launcher stops the services; the next launch resumes the historical scan. Pause/resume is available in the Local data engine panel. A duplicate launcher will share the database; a renewable lease allows only one backfill worker at a time. After an abrupt termination, lease takeover can take up to two minutes.

## February 2026 boundary

All candle history begins no earlier than 2026-02-01 00:00 UTC. The historical relay rejects requests before that cutoff.

The official Perpl SDK identifies mainnet exchange `0x34b6552d57a35a1d042ccae1951bd1c370112a6f` at block **54,773,010**, verified on Monad RPC as **2026-02-11 23:02:27 UTC**. The indexer begins at that deployment block. It does not invent data for February 1–10 or scan older chain activity.

Source: https://github.com/PerplFoundation/dex-sdk/blob/78ce8a06e39e2f9288792eba41aca5f3c08c1195/crates/sdk/src/lib.rs

## Local storage and data sources

The database is `.perpl-data/index.sqlite` under this source folder. Its WAL and SHM sidecars are part of SQLite's normal operation. Keep the folder to preserve indexed history. It is excluded from Git/source archives. Stop all launchers before copying the entire data folder as a backup.

- Historical event reads: `https://rpc2.monad.xyz`, a public endpoint listed by Monad.
- Current account/position reads: `https://rpc.monad.xyz`.
- Market metadata, prices and candles: Perpl public API and WebSocket.
- SQLite is built into Node; no PostgreSQL or Docker installation is needed locally.

Optional environment variables: `ENVIO_API_TOKEN` enables HyperSync historical reads; `PERPL_STORAGE_LIMIT_GB` sets the local database budget (default 10 GiB, minimum 1); `PERPL_RPC_URL` for historical RPC, `PERPL_LIVE_RPC_URL` for current-state RPC, `PERPL_DATA_DIR` for a persistent data folder, `PERPL_LOCAL_PORT` for a specific local port (default 0 chooses a free port). Defaults need no API keys. Never put RPC credentials in browser code. Hosting is not configured or purchased by this update.

## What works

- Live protocol market views and charts, bounded to February 2026 onward.
- Paste an address to read current balance, order-locked funds, available balance and open positions without authentication.
- Position size, entry price including rounding residue, collateral, unrealized PnL including funding, and liquidation estimate following the official SDK formula. Entry-notional/margin ratio is shown explicitly rather than claiming it is the trader's original chosen leverage.
- Locally persisted maker/taker fills, recorded realized-PnL events, deposits and withdrawals, with transaction links and paginated history.
- Exit win rate, profit factor, streaks and best/worst markets calculated before fees; trading fees reported separately.
- Local watchlists and comparison of up to three wallets, without wallet keys.
- Protocol indexed deposit/withdrawal totals, daily net flows, maker/taker fee totals, unique trading-account count and liquidation-event count.
- Visible backfill coverage, pause/resume, retry/backoff, adaptive RPC ranges, atomic checkpoints, duplicate-event protection, and checkpoint-hash reconciliation on restart/recovery.

## Coverage and limits

The initial February-to-present import is not finished. It can take many hours or longer on free public RPC, depending on event density and provider limits. Leave the launcher running to continue. Sleep/shutdown pauses work; the next launch resumes. Current wallet state works independently of the backfill.

The progress percentage measures blocks scanned, not time remaining. Indexed totals are partial until the scanner catches up. A wallet whose activity is later than the current checkpoint can have current positions but no indexed historical events yet. That does not mean it has never traded.

The worker keeps 64 blocks behind the head. This is a confirmation buffer, not a guarantee about finality. RPC outages are displayed and retried; an unavailable source is not treated as empty history. Deployments other than the verified mainnet exchange are outside this index.

PnL analytics use the explicit deltaPnlCNS and fundingCNS values from decoded exit events, before fees. They include partial exits and do not represent completed-round-trip net returns. Fees include maker/taker and builder fees in wallet totals; protocol trading fees exclude builder fees and are not labeled protocol revenue. Additional collateralization/unwind accounting is not included in these exit totals. Historical equity, cash-flow-adjusted returns, max drawdown, holding times and full directional OI still require further reconstruction. Do not interpret the cumulative exit-PnL chart as account equity.

Financial values are retained as integer strings in stored events; UI formatting uses floating-point numbers. AUSD is displayed at an assumed $1. Liquidation values are estimates derived from current on-chain parameters and can change with funding, collateral and protocol rules. Markets absent from public metadata are flagged rather than silently presented as complete.

## Validation

- `node tests/indexer.mjs`: ABI decoding, taker attribution per transaction, exact integer storage, February cutoff, checkpoint atomicity, restart/rollback, lease exclusivity, anchored history pagination, position side/price residue/liquidation calculation.
- `node tests/local-server.mjs`: actual HTTP/asset checks, Perpl public API, keyless real-wallet lookup, missing-account response, pause origin checks, invalid pagination and pre-February rejection. Uses an isolated test database.
- `node tests/browser.mjs`: installed Chrome desktop/mobile checks for keyless search, history tabs, watchlist, runtime exceptions and overflow. No fixture data is substituted. Requires Chrome; set PERPL_BROWSER_CHANNEL=msedge to use Edge.
- `node tests/analytics.mjs` and `node tests/relay.mjs`: existing scaling/analytics/signing helpers and read-only upstream relay.
- `node node_modules/typescript/bin/tsc --noEmit`.

These checks cover the local dashboard implementation; provider-specific validation is described below. The authenticated-wallet UI has been replaced by public reads. Existing signed relay utilities remain for compatibility but are not required by the wallet UI.

## Later deployment

This update is local only. The local Node server and SQLite indexer are not compatible with a static-only host or the retained Cloudflare starter without adaptation. Later, deploy an always-running Node service/worker with persistent storage, or migrate the storage layer to hosted PostgreSQL. The existing `.openai` scaffold is retained but no site has been published.

## Contract definitions

The read-only ABI is sourced from the official MIT-licensed Perpl SDK. `indexer/abi-source.json` records its revision; `indexer/PERPL-SDK-LICENSE.txt` retains attribution. Read contract definitions and raw logs before changing accounting rules.


## Faster backfill with free HyperSync

Run `node scripts/setup-hypersync.mjs` (or **Setup HyperSync.cmd** from the outputs folder). Create a free HyperSync token at https://envio.dev/app/api-tokens, then enter it into the hidden local prompt. Setup verifies February archive access and compares a recent 100-block sample with RPC, including wallet attribution, before writing `.env`. Close the old dashboard launcher and start it again. Keep it running; existing checkpoints and events are retained. Startup can wait up to two minutes for an old worker lease to expire.

The token is a server credential, never a per-wallet key. The browser still only needs wallet addresses. `.env` is ignored and excluded from source packages; do not share it. No paid package or hosting is needed. Envio's free tier has fair-use limits: 429 responses wait and retry without losing progress. Token rejection is shown explicitly, not treated as empty data.

HyperSync queries select only Perpl financial event topics and join the associated transaction logs for taker account/market attribution. This excludes transactions containing only order requests/cancellations. Unrelated contract logs returned by the join are discarded. Cursor-based pages are committed in order; invalid cursors, missing context or block-hash mismatches leave the checkpoint unchanged. RPC remains available for current wallet state and history when no HyperSync token is configured. Restart to change the selected source.

Stored data consists of decoded Perpl financial events, wallet snapshots and compact scan checkpoints. Full blocks, other contracts' events, and unfilled order requests are not persisted. Storage can still grow to multiple GB for the entire protocol. The app pauses at the default 10 GiB database/sidecar budget, or if free disk falls below 5 GiB (a final page can slightly exceed the budget). It does not delete history. Increase the budget in the server environment and restart only if sufficient disk is available.

The Local data engine panel shows the source, storage and a rolling throughput/ETA after enough samples. This is an extrapolation of recent block processing, not a completion guarantee; event density and free-tier throttling change the pace. No full-history ETA is promised until an authenticated run is measured.

Decoder benchmark on 100 real blocks starting at block 100,000,000: 2,794 downloaded logs yielded 312 stored financial events. Previous ABI parsing took about 5,200 ms; cached fragments and selective request decoding took 136 ms in the same run (about 38x faster decoding, not 38x faster end-to-end indexing).

Additional checks: `node tests/hypersync.mjs` validates filters, pagination, request context, error handling, checkpoint retention, rate-limit handling and storage pauses. Setup performs the live HyperSync/RPC comparison using your token.

Sources: https://docs.envio.dev/docs/HyperSync/hypersync-query ; https://docs.envio.dev/docs/HyperSync/api-tokens ; https://docs.envio.dev/docs/HyperSync/hypersync-supported-networks ; https://envio.dev/pricing/hypersync


## October 13: parallel historical import

The local launcher now starts the historical indexer in a worker thread, independent of dashboard/live-wallet HTTP work. By default, two HyperSync fetchers download disjoint 5,000-block windows and one public RPC fetcher downloads the next 500 blocks concurrently. RPC requests use smaller adaptive subranges with bounded retries. One writer commits only a complete, ordered prefix. Failed or missing ranges never advance the history checkpoint, and subsequent cycles refetch unfinished work. There is no second full database. HyperSync's shared free-tier cooldown applies to both HyperSync fetchers; concurrency does not increase the token's quota.

Set `PERPL_BACKFILL_WORKERS=1` in the local `.env` to use the original sequential HyperSync mode, `2` for two HyperSync fetchers, or `3` (default) to include the RPC fetcher. Restart the launcher after changing configuration. The dashboard displays the active fetcher count after the worker starts. A previous worker lease can take up to two minutes to expire after an abrupt exit.

Protocol summary queries build an in-memory cache once per server session and then aggregate only newly committed blocks. The first calculation can take tens of seconds on a large database; later requests are substantially faster. A read transaction keeps each summary consistent, and rollback revisions invalidate cached totals. The indexer continues on its own thread during the first calculation.

Measured on this machine: a 10,500-block sample at block 105,000,000 produced 5,968 identical events in 7,649 ms sequentially versus 3,483 ms with parallel fetching (2.2x sample speedup). An incremental protocol summary took 305 ms versus 17,931 ms for the initial full aggregation. These are sample timings, not a guaranteed full-history ETA. Free-tier throttling was observed and respected. Storage limits remain 10 GiB plus the existing free-space floor; parallelism does not reduce the total storage needed for full Perpl history.

Checks: `node tests/parallel.mjs` covers disjoint range planning, out-of-order completion, failure gaps, prefix commits, resumption, parent hashes and cache invalidation. `node tests/worker-server.mjs` uses an isolated disposable database seeded at a real historical sample; it verifies parallel commits and responsive HTTP during live indexing. It requires the configured HyperSync token and honors free-tier cooldowns. No benchmark or test resets the user's historical database.
# Latest local UI update

Use the existing Windows launcher or `npm run dev:local`. The UI includes persistent light/dark themes, Protocol/Wallets/Liquidations navigation, focused analytics sections and an automatic refresh countdown. The summary database gains idempotent liquidation-detail, account-address and compact market-observation tables; raw history is preserved. Public snapshots refresh independently from chain catch-up. Historical liquidation detail is partial and labelled.

Validation: `node tests/finishing-data.mjs`, `node tests/refresh-fixes.mjs`, `node tests/summaries.mjs`, `node tests/browser.mjs`, and TypeScript. The extended `tests/finishing-browser.mjs` run expects an isolated copy of developer summary data in `.sites-runtime/qa/finishing-data`.

---

