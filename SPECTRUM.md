# Spectrum Business: parallel RPC or unified API

**October 13 endpoint correction:** current defaults and the installed `.env` use `SPECTRUM_RPS=10`, `SPECTRUM_WORKERS=2`, and `SPECTRUM_WINDOW_BLOCKS=100`. These supersede the initial 100 RPS/eight-worker values documented below. Live requests use 2 RPS; each client has at most four in-flight requests. Rate-limit responses halve request speed once per cooldown incident (down to 1 RPS), while respecting provider wait times. Rates remain reduced for the lifetime of that client.

The authenticated endpoint returned `-32000: response exceeds size limit` for a 1,000-block log query. That exact wording is now recognized as a range limit and triggers subdivision instead of endless retries. A 200-block test using the updated settings fetched 154 financial events in 5.84 seconds and staged them successfully in an isolated SQLite database; user history was not modified by the test. Restart the dashboard after installing this change; rerunning setup is unnecessary for an already configured endpoint.

## Split historical coverage

Run `node scripts/setup-spectrum.mjs --parallel` (or **Setup Parallel Sources.cmd**). This mode requires the existing `ENVIO_API_TOKEN`. A bounded binary search tests block headers and single-block Perpl logs against public RPC from the saved checkpoint to head minus 64. Search stops at a 1,000-block interval instead of chasing a moving single-block cutoff. The start is verified 10,000 blocks beyond the tested upper boundary, clamped to the confirmed head. If unavailable, setup tries buffers of 20,000 and 40,000 blocks, then the confirmed head. HyperSync retains responsibility for every block before the selected Spectrum start. This assumes monotonic retention; it does not prove every intervening block is accessible. Null blocks, repeated internal log errors or mismatching log sets are treated as unavailable at that probe; authentication, quota and transport failures abort. A final first-range and newer sample comparison validates decoded data before configuration is saved. `--check-only` does not save settings.

Setup writes `PERPL_HISTORY_SOURCE=mixed` and `SPECTRUM_START_BLOCK` alongside the private endpoint settings. HyperSync/public RPC keeps the original continuous `meta.next` checkpoint. Spectrum has its own `futureNext` and an independent async loop, sharing the same worker's writer lease. Both loops honor the global pause, disk floor and storage cap. Their backoff timers are separate. Spectrum's eight fetchers share the existing rate gate; HyperSync quota remains unchanged.

The new `future_batches` SQLite table stores validated, decoded Perpl rows and compact batch headers atomically with `futureNext`. No second database is created. Existing tables and data are retained. Staged batches survive restart and are shown separately in coverage; they do not enter wallet performance or continuous protocol totals yet. The original history loop stops before the first staged range, then verifies its hash against public RPC and its parent against the last committed batch. Promotion inserts events, advances `next` and deletes that staged batch in one transaction. Event IDs are deduplicated. A hash mismatch retains the saved data and reports an error.

If a future batch arrives while HyperSync is fetching an overlapping range, the main batch retries against the shortened boundary. If HyperSync has already committed it, the late Spectrum batch is discarded and its cursor catches up to the main checkpoint. This allows HyperSync to keep advancing even when Spectrum's rolling retention prevents reads. No checkpoint is advanced over missing blocks. Switching back to HyperSync retains and merges already staged batches but stops Spectrum requests.

Validation: `tests/mixed-sources.mjs` covers progress while the other lane is waiting, overlap races, prefix failures, restart persistence, ordered promotion, totals, hash mismatch and retention errors. `tests/spectrum-retention-setup.mjs` runs the actual interactive setup with a mocked provider whose retention begins after the saved July checkpoint. Authenticated retention/speed still requires the user's private endpoint.

## Single-source setup

Run **Setup Spectrum.cmd** from the outputs folder, or `node scripts/setup-spectrum.mjs` here. In Spectrum's dashboard, create or select a Monad mainnet endpoint with archive access and copy the full HTTPS URL. Prefer a direct RPC endpoint; the unified API endpoint is also supported through `rpcProxy`. Enter the URL in the hidden local prompt. Do not send it in chat or put it in browser code.

Setup detects the endpoint type, checks chain ID 143, and reads the saved checkpoint from SQLite in a read transaction. It verifies the last saved block hash and compares the first 50 remaining blocks plus a more recent sample against public RPC. Both setup and worker startup require only the saved boundary and subsequent history; February access is required only for a fresh database. The exact saved block is used, never a hard-coded month or a skipped range. Missing boundary data fails without advancing the checkpoint. Setup respects `PERPL_DATA_DIR`, including when configured in the local `.env`.

Configuration is saved only after those checks pass. Close the existing launcher and start it again. The Local data engine panel should show **Spectrum** and **8 parallel fetchers**. Existing checkpoints, events and the HyperSync token are retained. An old worker lease may take up to two minutes to expire. `node scripts/setup-spectrum.mjs --check-only` performs validation without saving settings.

Eight fetchers read disjoint 1,000-block windows. All backfill requests share a rate gate capped at 100 starts/second and 16 in-flight requests. Current wallet reads use a separate 10-request/second gate. Spectrum's pricing page lists Business at 200 requests/second; verify the limits and credits in your account. Requests use your existing plan credits. No plan purchase, upgrade, webhook or hosting service is created by this setup. Direct EVM RPC reads are documented at 50 credits/request; the unified `rpcProxy` API is 100 credits/request.

Both modes use native `eth_getLogs` semantics. The separate high-level `getLogs` API has a 1,000-log newest-first pagination contract, so it is not substituted for a complete forward block scan. Queries filter the Perpl exchange and its selected event topics. Order-request context is decoded for attribution but not stored. Missing log timestamps are fetched from block headers through the same rate gate. Oversized ranges are subdivided, rate limits apply a shared cooldown, and only a complete ordered prefix is committed. Errors do not advance past missing ranges. Storage and confirmation guards are unchanged.

Server-only `.env` settings written by setup:

- `SPECTRUM_ENDPOINT`: the full private HTTPS URL (credential included).
- `SPECTRUM_MODE`: `rpc` or `api`, detected by setup.
- `SPECTRUM_RPS=100`: backfill request starts per second; supported range 1–150.
- `SPECTRUM_WORKERS=8`: concurrent block-range fetchers; supported range 1–12.
- `SPECTRUM_WINDOW_BLOCKS=1000`: blocks per fetcher; supported range 1–10,000, reduced automatically for log limits.
- `PERPL_HISTORY_SOURCE=spectrum`: selects Spectrum when its endpoint is present.

Without a Spectrum endpoint, source selection remains HyperSync when its token is present, otherwise public RPC. To return to HyperSync while retaining Spectrum settings, set `PERPL_HISTORY_SOURCE=hypersync` and restart. A failing Spectrum endpoint does not silently switch providers. Market metadata, candles and live market feeds still use Perpl's public API. Wallet users need only their address.

Authenticated Spectrum throughput has not yet been measured. Higher request limits alone do not establish a completion time: log density, archive latency, missing timestamps and SQLite writes affect throughput. After activation, use the rolling speed/ETA over several minutes. Full protocol history still uses multiple GB and the 10 GiB storage pause remains enabled.

Validation: `node tests/spectrum.mjs` covers direct/proxy envelopes, read-only calls, credential redaction, shared throttling, adaptive log ranges, block hashes, source selection and failed-range checkpoint retention. Existing indexer, parallel and HyperSync regression tests and TypeScript checks also passed. Setup performs the live authenticated comparison on your machine before activation.

`node tests/spectrum-resume.mjs` verifies both setup and worker operation against a simulated July-only provider. It also covers unavailable boundary blocks, setup hash mismatch, inconsistent saved checkpoints and configuration preservation. `node tests/spectrum-setup.mjs` verifies that a fresh database still requires February access and reports authentication failures accurately.

Documentation: https://spectrumnodes.com/docs/chains/monad ; https://spectrumnodes.com/docs/authentication ; https://spectrumnodes.com/docs/api-reference/rpc ; https://spectrumnodes.com/docs/api-reference/logs ; https://spectrumnodes.com/docs/user-guides/credit-usage ; https://spectrumnodes.com/pricing
