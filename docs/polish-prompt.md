# Perpl Analytics — Polish & Expansion Brief (for the builder LLM)

You are the engineer who built **Perpl Analytics** (https://perpl-analytics.vercel.app, this repo). A hackathon judge — a senior on-chain data analyst and dashboard designer — has reviewed every tab and every metric. Your job is to turn the current build into a polished, judge-ready product: fix every UI defect listed below, restructure charts into one consistent system, and add the missing metrics that the existing data pipeline (or a small extension of it) can support.

The hackathon brief asks for **"Nado's clarity + HyperScreener's breadth"** (https://stats.nado.xyz/, https://hyperscreener.asxn.xyz/home): a fast, modern, dark-mode, purple-themed dashboard with protocol-level and wallet-level views, real-time where it matters, a smooth switch from protocol view to wallet drill-down, and **no clutter: signal over volume of data**.

## Ground rules

1. **Do not break the data pipeline.** Keep the Vercel → `api/proxy.mjs` → Supabase backend flow, the five-minute refresh, the 400 MiB storage guard, the CDN caching and the free-tier protections. Any new table or aggregate must state its estimated storage growth per month and must fit inside the existing budget.
2. **Stay honest about data.** Keep the coverage notes and the "partial / estimated" labels. Never show a missing value as zero. When a metric is a proxy, label it as one (for example "Net deposits (TVL proxy)").
3. **Make the code readable.** The components are currently minified onto very long lines (for example `components/dashboard.tsx` is about 20 KB in roughly 50 lines). Reformat everything with Prettier first, then split `dashboard.tsx` into one file per tab under `components/tabs/`. Judges read the code too.
4. Run `npx tsc --noEmit`, `node scripts/build-web.mjs`, `node tests/web-proxy.mjs` and `npm run test:cloud` before finishing. Update `tests/browser.mjs` / `tests/finishing-browser.mjs` where selectors change.
5. Check every item below in the running app at **1440px, 1024px and 390px widths, in both dark and light themes**, and attach before/after screenshots to the PR.

---

## Part 1 — The judge's assessment (why these changes matter)

| Area | Current score | Main gaps |
|---|---|---|
| Protocol headline metrics | 6/10 | Only 24h volume, with no 7d/30d/all-time switch. The "Protocol TVL" tile is really net deposits. No fees/revenue tile on Overview. No change deltas or sparklines. Every card uses the same generic icon. |
| Time-series charts | 5/10 | The control layout is cramped (Cumulative sits next to the market selector). `1D / 7D / 1M` reads like a time *range* but actually sets bucket *size*, and there is no range selector. Cumulative is on by default everywhere, which clutters stacked charts. The right axis has no label. Each chart family uses a different tooltip style. |
| Market breakdown | 6/10 | The six-colour palette is all purples, so stacked bars and the treemap are hard to tell apart. No long/short skew, which the brief requires. No funding APR. The table lacks OI cap utilisation, max leverage and sparklines. |
| Capital flows | 5/10 | Withdrawals are drawn as positive bars of the same shape as deposits. Net flow bars are not coloured by sign. No cumulative net-deposit (TVL) curve as the hero chart. |
| Liquidations | 6/10 | Only a count chart. No liquidated notional by side or market over time. Order-book versus backstop liquidations are not split. |
| Funding / risk | 5/10 | Funding is shown per interval to 4 decimals, which is unreadable; annualise it. No market × time funding heatmap. History stops at the 30-day API window. |
| Traders | 5/10 | A donut chart for size tiers. Gains are coloured purple instead of green. Bucket labels are ambiguous ("Loss < $10K"). No concentration metric. |
| **Wallet drill-down** | **3/10** | **The biggest gap against the brief.** No trade history, no realised PnL, none of win rate / profit factor / max drawdown / streaks / hold time / best-worst market, no watchlist, no side-by-side compare. The local build had a watchlist and three-wallet compare; the cloud build dropped them. |
| Real-time | 5/10 | Everything moves on a five-minute tick. Mark prices, the market table and wallet uPnL should update live through Perpl's WebSocket. |
| Craft / finish | 5/10 | The volume watermark still says **"PERPL PULSE"** (old brand). 8–10px text appears in many places. Loading states are text-only. Tabs, filters and wallets are not in the URL. The headline hero pushes the metrics below the fold. Dead code (`LocalProtocol`, the old `Chart`). |

Fixing the wallet section and the chart system will move this project the furthest with the judges.

---

## Part 2 — Global UI system fixes (do these first; every chart inherits them)

### 2.1 One `ChartCard` component with a fixed control layout (fixes the reported Cumulative/asset defect)

**Defect:** In the Total volume chart the controls stack into about four rows: a bar/line icon picker, the `1D/7D/1M` picker, a market `<select>` in `.chart-toolbar`, then a `.chart-legend` row holding "Interval volume" and the **Cumulative** pill. The Cumulative toggle sits right next to the asset selector with no visual separation, so the two are easy to mis-click. `AnalyticsChart` makes it worse: series legend chips, a **"Bars"** toggle (still labelled "Bars" when the chart is a line) and the Cumulative pill all share one wrapping row, so series filters and view options are mixed together.

Replace both `VolumeChart` and `AnalyticsChart` with a single `ChartCard` that uses this fixed anatomy:

```
┌────────────────────────────────────────────────────────────────────────┐
│ Title (i)                                     [ D | W | M ]   [⋯]     │  ← header row
│ $1.24B   ▲ 12.4% vs prev. period                                       │  ← headline value + delta
│ [Market ▾ All markets]                │   [▮ Bars | ⟋ Line]  ◯ Cumulative │  ← toolbar: filters LEFT, display options RIGHT
│                                                                        │
│                     plot (fixed height, both axes labelled)            │
│                                                                        │
│ ■ BTC  ■ ETH  ■ SOL …   - - Cumulative (right axis)                    │  ← legend BELOW the plot
│ UTC · current bucket partial · Source: Perpl API candles               │  ← footnote
└────────────────────────────────────────────────────────────────────────┘
```

Rules:
- **Filters** (market, side, cohort) are always on the **left** of the toolbar. **Display options** (chart type, cumulative, log scale) are always on the **right**. Separate the two groups with at least 24px of space plus a 1px vertical divider on desktop. On mobile, put them on two rows with filters first.
- Make **Cumulative** a labelled **switch** (track + thumb), not a pill that looks like a tab. Remove the "Bars" toggle. Use a `Bars | Line` segmented control only where both make sense, and make the series hide/show chips in the legend do the rest.
- All interactive controls are **32px high on desktop and 40px on touch**, at least 12px text, with 8px between sibling buttons inside a group. No control may wrap onto the same line as a different group.
- The legend sits **below** the plot. It shows series chips that are clickable to hide or show a series. When cumulative is on, add a legend entry styled like its line: "Cumulative (right axis)".
- **Rename `1D / 7D / 1M` to `D / W / M`** (tooltip: "Daily / Weekly / Monthly buckets"). Add a **range** selector `7D · 30D · 90D · YTD · All` on the page's sticky filter bar (see 2.4). Today a user cannot look at "the last 30 days"; the brief explicitly asks for easy timeframe switching.
- The `⋯` overflow menu holds **Download CSV**, **Download PNG**, **Log scale**, **Copy link to chart**. Remove the inline download icons scattered elsewhere, except on tables.
- The `(i)` info icon opens a popover with the metric definition, source and coverage. Move the footnote-style text out of the panels and into these popovers.
- The headline value and delta are for the **selected range**, compared with the previous equal-length range.

### 2.2 Cumulative-line defaults and dual axes
- **Cumulative ON by default only for:** Total volume, Trading fees, User growth (registrations), Net capital inflows (where cumulative = TVL proxy).
- **Cumulative OFF by default for:** every stacked or multi-series chart (Volume by market, fee components, deposits vs withdrawals), all count charts (fills, liquidations), funding and any rate or percentage chart. Stacked charts must never draw one dashed cumulative line per series. If cumulative is enabled on a stacked chart, draw **one** total cumulative line.
- Label the right axis ("Cumulative") and render it in `--muted`. Draw the cumulative line in a lighter tint of the series colour at 1.5px, solid, with a subtle area fill under it at 6% opacity. Keep dashed lines for projections and partial buckets only.
- Render the current (partial) bucket at 50% opacity with a hatched pattern, and say so in the tooltip ("Partial — 14h of 24h").

### 2.3 Colour system (the current palette fails for categories)
`COLORS = ['#ab83ff','#8051db','#c3a4ff','#67419c','#8976ae','#e0ceff']` is six near-identical purples, so stacked "Volume by market", the treemap and the trader-size donut cannot be read.
- Keep **purple as the brand and primary-series colour**. Build a **categorical palette** of 8 hues that starts with brand purple and then uses distinct hues that work on the dark background (for example purple, teal, amber, sky, pink, lime, orange, slate). Check it for colour-vision deficiency (deuteranopia and protanopia) and for at least 3:1 contrast against `--panel` in both themes. Put it in CSS variables `--cat-1 … --cat-8`.
- **Semantic colours are fixed everywhere:** `--green` = positive / long / inflow / gain, `--red` = negative / short / outflow / loss / liquidation, purple = neutral brand series. Fix these offenders: `MarketBars` (positive funding and basis drawn purple), `TraderCharts` PnL distribution (gains drawn purple), and the net-flow chart (one colour for both signs).
- Assign each market a **stable colour** across all charts (BTC is always the same colour), keyed by market id.
- Add a **sequential purple ramp** for heatmaps and a **diverging red↔neutral↔green ramp** for funding and flow heatmaps.

### 2.4 Layout, typography and information hierarchy
- **Shrink the page hero.** "The protocol, at a glance." with its subtitle and eyebrow takes about 180px above the KPIs. Replace it with a compact 48px page title row: tab name, then breadcrumb "Protocol / Overview" on the left and the "Last sync · next in 4:12" status pill on the right. The KPI row must be visible above the fold at 1440×900.
- Add a **sticky filter bar** under the sub-nav: range selector (`7D 30D 90D YTD All`), market filter (multi-select chips) and a UTC note. It applies to every chart on the tab. Individual charts may override only their bucket size.
- **Minimum text sizes:** 12px for body, labels, axis ticks and tags; 11px absolute minimum for footnotes. Replace every 7–10px value (`.tag` at 7–8px, `.period-picker button` at 10px, axis ticks at 10px, `.metric-note` at 9–10px).
- Use **tabular numerals** everywhere numbers appear (tables, tooltips, axes), not only in KPI values.
- Pick one display font (Manrope) for numbers and headings and one UI font (DM Sans). Remove the leftover `Arial` brand-mark style.
- Use a 4/8px spacing scale and consistent panel padding (20px desktop, 14px mobile), with the same gap between all grid cards (16 or 20px, not a mix of 15/18/20).
- On the sub-nav, add a horizontal-scroll fade on mobile and make the active tab underline as wide as the label.

### 2.5 KPI cards (`Metric`)
Each card shows: label + info icon, value, **delta vs the previous period** (green ▲ / red ▼, with "vs prev 7d"), a **30-point sparkline** (Overview cards only), and a one-line footnote. Drop the generic `Activity` icon on every card. Use a meaningful icon per metric, or no icon. Do not render empty `note=""` rows. Use skeleton shimmer while loading, never the text "—" during load. "—" means "not available" and gets a tooltip explaining why.

### 2.6 Tooltips
There are three tooltip implementations: `.volume-tooltip`, inline `contentStyle` objects, and hard-coded hex colours in `pulse-ui.tsx`'s `Chart`, which are wrong in light mode. Build **one** `<ChartTooltip>`:
- Date and bucket label ("Week of 6 Oct 2026 · UTC")
- One row per visible series: colour swatch, name, value
- A total row for stacked charts
- The share of total for stacked charts
- The cumulative value, if shown
- The partial-bucket note, if relevant

Themed with CSS variables.

### 2.7 Branding, state and polish
- **Remove the `PERPL PULSE` watermark** in `volume-chart.tsx`. Either use "Perpl Analytics" at 4% opacity or drop it. Search the repo for other "Pulse" leftovers that users can see.
- **Put state in the URL:** `?view=protocol&tab=markets&range=30d&market=1` and `?view=wallet&address=0x…&compare=0x…,0x…`. The back button, refresh and shared links must all work. Judges will paste links.
- Make the **Ctrl K** search a command palette (cmdk). It accepts addresses, market symbols ("BTC" opens the market view) and tab names, and shows recent and watched wallets. Show `⌘K` on macOS.
- Replace "Loading volume…" and similar text with **skeleton charts**. Add empty states with an icon and a clear reason. Error states get a retry button.
- Replace the letter placeholders (`₿`, `Ξ`, first letter) with **real token icons** for market symbols, falling back to a monogram in the market's colour.
- Make interactive rows (OI-by-market list, tables) open a **market detail drawer**, not just switch tabs. Clicking BTC in "Open interest by market" today only calls `setSection('Markets')` and loses the context.
- The light theme must pass the same checks. In particular `pulse-ui.tsx` `Chart` uses fixed dark hex colours.
- Delete dead code: `LocalProtocol` and `Chart` in `summary-protocol.tsx` / `pulse-ui.tsx` (if unused after the refactor), the unused `tvl` sum in `dashboard.tsx` (or use it, see 4.A), and the `signedApi`/`importReadKey` helpers if nothing calls them.
- Accessibility: every chart gets an `aria-label` summary and a "View as table" toggle in the overflow menu. Focus rings must be visible. Interactive targets must be at least 24×24px. Respect `prefers-reduced-motion`.

---

## Part 3 — Tab-by-tab fixes

### Overview
1. **KPI row 1 (headline):** Volume, with an inline `24h | 7d | 30d | All` mini-toggle inside the card (or driven by the global range); Open interest; **Net deposits (TVL proxy)**, renamed from "Protocol TVL", with a tooltip explaining it excludes trader PnL; and **Fees** (sum of trading + builder + position fees for the range, labelled "Fees collected", not revenue).
2. **KPI row 2 (activity):** Active traders (24h, from the `accounts` table), New accounts (range), Net flow (range, coloured by sign), Liquidations (24h count + notional).
3. **Hero chart:** Total volume ChartCard, as in Part 2.
4. **Right column:** "Open interest by market". Keep the composition bar, but make the colours distinct. Add a **long/short skew** mini-bar per market once 4.B lands. Each row opens the market drawer.
5. **Second row:** Fees ChartCard (stacked by category, cumulative total line) and User growth ChartCard (new registrations as bars plus a cumulative line, **plus a DAU line**, see 4.A).
6. Add a compact **"What changed in the last 24h" strip:** largest liquidation, largest deposit, top market by volume change, most extreme funding. HyperScreener-style signal, four items only.

### Markets
1. Keep the market-share treemap, now with the categorical colours and a toggle between `Volume | OI | Fees`. Show the percentage share on each tile.
2. Volume by market: stacked bars, **cumulative off by default**, with a `Stacked | 100%` toggle to show the market-share trend over time.
3. **Market table additions:** a 7-day price sparkline; 24h volume Δ%; OI and OI Δ 24h; **funding APR** (annualised: `rate × intervals per year`) with the per-interval rate in the tooltip; max leverage (from `initMarginFracHdths`); **OI cap utilisation %** (`OI / maxOpenInterestLNS`); spread (bps); volume/OI turnover. Make the table header sticky. Every column is sortable by clicking its header, not via a separate `<select>`. Keep CSV export.
4. **Market detail drawer** (opened from any market click): price chart (candles from the existing API), volume, OI over time, funding history, liquidations in this market, and top traders in this market (when available).

### Fees
1. KPIs: Total fees (range), Trading fees, Builder fees, Position (protocol + insurance) fees, each with a delta. Rename the repetitive "Recorded history" notes to the range label.
2. Charts: fees by category (stacked), **effective fee rate in bps** (`trading fees / volume × 10,000`, daily line), **annualised fee run-rate** (30-day fees × 365/30), and **maker vs taker fee split**.
3. A builder leaderboard (see 4.B) once builder IDs are stored.

### Capital flows
1. Hero: **Cumulative net deposits (TVL proxy)** area chart. This is the line every perp dashboard leads with.
2. **Deposits vs withdrawals as a mirrored bar chart:** deposits as green bars above zero, withdrawals as red bars below zero, with a net-flow line on top.
3. Net flow bars **coloured by sign**.
4. Add these KPIs: number of deposits and withdrawals, average deposit size, unique depositors (range), and the **largest deposits/withdrawals in the last 24h** as a small table with wallet links.

### Growth (rename to **Users & activity**)
1. **DAU / WAU / MAU** lines and **stickiness (DAU/MAU %)**, from the existing `accounts(day, account, fills)` table.
2. **New vs returning active traders** (stacked bars). An account is "new" on its first fill day.
3. **Weekly retention cohort heatmap** (cohort = week of first fill; cells = % of the cohort active in week N), using the sequential purple ramp. This is the single most "analyst-grade" chart you can add with data you already have.
4. Merge "Maker fills" and "Taker fills" into **one chart** with two series, and add **fills per active trader**.
5. Registrations vs first-trade conversion (accounts created vs accounts with their first fill).

### Risk & funding
1. **Funding:** show **annualised APR** as the primary unit everywhere; keep the per-interval rate in tooltips. Replace the custom `MarketBars` with a sorted diverging bar chart (green positive / red negative, zero line labelled, the value printed at the bar end).
2. **Funding heatmap:** markets × days (last 30 days) on the diverging ramp. This is HyperScreener's most-used view.
3. Extend funding history beyond 30 days by indexing on-chain `FundingEventCompleted` (see 4.B).
4. Mark/oracle basis and spread: keep them, but in a compact table with conditional formatting instead of two more bar panels. Panel count is part of the "no clutter" brief.
5. **New risk KPIs:** OI cap utilisation (highest market), OI / TVL-proxy ratio (system leverage), insurance-fund balance and flows (4.B), and the count of ADL/deleverage events (4.B).

### Traders
1. Replace the "Volume by trader size" donut with a **horizontal bar chart** or, better, a **concentration (Lorenz) curve** plus KPIs: top-10 / top-100 wallets' share of volume.
2. PnL distribution: use **green** for gains and **red** for losses, symmetric bins with clear labels (`< −$100K`, `−$100K…−$10K`, `−$10K…$0`, `$0…$10K`, `$10K…$100K`, `> $100K`), plus a "% of wallets profitable" KPI.
3. Add a **PnL vs volume scatter** (log x axis), one point per wallet, coloured by ROI sign. Clicking a point opens the wallet.
4. Table: make the rank column reflect the current sort (it currently always says "Volume rank"). Add a ☆ watch button per row. Make the header sticky and every column sortable.
5. Add "Smart money" positioning once 4.B lands: the net long/short of the top 100 PnL wallets per market.

### Liquidations
1. **Liquidated notional by day, split by side**: long liquidations in red stacked above zero, short liquidations stacked below zero (the HyperScreener convention), with a market filter.
2. **Liquidations by market** (bar chart) and a **long vs short liquidation ratio** KPI.
3. Split **order-book vs backstop liquidations** using the `onOrderBook` field already in the `PositionLiquidated` args stored in `liquidation_details`.
4. **Trader loss realised in liquidations** (`deltaPnlCNS`) and the **largest liquidation in 24h / 7d** KPIs.
5. Keep the table, but add a size-bucket filter and a "whales only (> $100K)" quick filter.

---

## Part 4 — New metrics, grounded in what the pipeline can provide

### 4.A Available **now** from existing tables and API (no indexer change)
- `accounts(source, day, account, fills)`: DAU/WAU/MAU, stickiness, new vs returning, retention cohorts, fills per trader, activity concentration (top 1% of accounts' share of fills).
- `daily(day, event, count, amounts)`:
  - Effective fee rate, combined with candle volume
  - Fee run-rate
  - Maker/taker fill ratio
  - Average deposit and withdrawal size
  - Cumulative net deposits
  - Builder-fee share of total fees
- `liquidation_details.args`:
  - Notional by side and market
  - Order-book vs backstop split (`onOrderBook`)
  - Trader loss (`deltaPnlCNS`)
  - Liquidation price vs mark (`liqPricePNS` vs `markPricePNS`) as a "cascade depth" indicator
- Perpl market state: per-market `tvl` (`v.tvl`, already parsed in `normalize()` but never displayed), OI, funding, spread, basis. Derived: volume/OI turnover, OI/TVL, funding APR.
- Leaderboard snapshot: concentration, % profitable, median ROI, PnL vs volume scatter.

### 4.B Small indexer extensions (store compact daily aggregates, not raw events)
For each item, add the aggregate to `indexer/summary-spec.mjs` and the cloud job, give it a migration in `cloud/schema.sql`, and estimate its storage.
1. **Directional OI / long-short skew** (the brief requires this): keep a per-market running long and short lot total from `PositionOpened(V2)`, `PositionIncreased(V2)`, `PositionDecreased`, `PositionClosed`, `PositionInverted`, `PositionLiquidated`, `PositionDeleveraged(V2)` and `PositionUnwound*`, using `positionType` and the start/end lot fields. Store a daily snapshot per market. If exact reconstruction is not feasible in time, ship a clearly labelled proxy: the net position of the top N leaderboard wallets, read through the existing wallet contract reads every 15 minutes.
2. **Per-account exit events table** (the key to the wallet analytics in Part 5): `wallet_exits(account, time, market, side, lot, price, delta_pnl, funding, kind[close|decrease|liquidation|deleverage|invert], tx)` from `PositionClosed`, `PositionDecreased`, `PositionLiquidated`, `PositionDeleveraged*` and `PositionInverted`. Add `wallet_opens(account, time, market, side, lot, price, leverage)` from `PositionOpened*` and `PositionIncreased*` for hold times and average leverage. These rows are small; estimate MB/month and confirm it fits the 400 MiB guard. Otherwise keep a rolling 90 days plus the per-account aggregates.
3. **Per-account flows:** `CollateralDeposit` and `CollateralWithdrawal` by `accountId` (the deposit/withdrawal history on the wallet page, and cash-flow-adjusted returns).
4. **Builder attribution:** `builderId` and `builderFeeCNS` from `MakerOrderFilledV2` and `TakerOrderFilledV2`, aggregated daily by builder (top builders by volume and fees, a new ecosystem view).
5. **On-chain funding:** `FundingEventCompleted(perpId, actualRatePct100k, fundingPaymentPNS)` gives complete funding history from February, not just 30 days. Also compute cumulative funding paid by longs to shorts.
6. **Insurance fund and system risk:** `TransferProtocolToPerp(toInsuranceFund)`, `InsurancePaymentForSettlement`, `TransferPerpInsToProtocol`, plus counts of `PositionDeleveraged*` (ADL) and `PositionUnwound*`. Shows insurance-fund inflows and outflows and ADL frequency.
7. **Market parameters:** from `ContractAdded` / `ContractAddedV2` / `InitialMarginFractionUpdated`, read `maxOpenInterestLNS` and the initial-margin fraction for OI cap utilisation and max leverage.

### 4.C Optional external context
- **Market share vs other perps** (optional in the brief, but cheap): the DefiLlama derivatives API (`https://api.llama.fi/overview/derivatives`, free, no key). Show Perpl's share of perp volume (a) on Monad and (b) against a short peer list (Hyperliquid, Nado, others on Monad), refreshed hourly and cached in `api_cache`. One card with a 30-day share line is enough.
- Dune: no recurring queries are needed. Keep the current one-time historical baseline.

---

## Part 5 — Wallet drill-down: bring it up to the brief (highest priority after Part 2)

The cloud wallet page currently shows balances, open positions and four leaderboard numbers. The brief requires all of the following. Build them on the 4.B.2 / 4.B.3 tables.

1. **Wallet header:** address with copy, a MonadScan link, a ☆ Watch button, a "Compare" button and a "Share" button (copies the URL). Badges: rank, first-seen date, last-active time, number of markets traded.
2. **Portfolio / margin overview:** equity (balance + collateral + uPnL), available balance, locked in orders, **margin usage %** as a gauge, account leverage (total notional / equity) and **distance to liquidation** for the nearest position (in % of price).
3. **Open positions:** keep the current columns and add mark price (live), position notional, **uPnL %**, distance to liquidation % with a red/amber/green chip, and funding accrued. Show long/short with green/red side chips and a mini bar for liquidation proximity.
4. **Performance analytics** (from `wallet_exits`, before fees, labelled so): realised PnL (all time and range), **win rate**, **profit factor** (gross profit / gross loss), average win / average loss, **max drawdown** on the cumulative realised-PnL curve, longest win and loss **streaks**, **average hold time** (requires `wallet_opens`), **best and worst markets** (PnL by market bar chart), long vs short PnL split, fees paid, funding paid/received.
5. **Charts:** a cumulative realised-PnL line (green above zero, red below, with drawdown shading); daily PnL bars; a PnL-by-market horizontal bar; a trade-size histogram.
6. **Trade history table:** time, market, side, action (open/increase/decrease/close/liquidation), size, price, realised PnL, fee, tx link. Paginated, filterable by market/side/action, CSV export.
7. **Deposits and withdrawals** history table, and a net-deposit line overlaid on the PnL chart for cash-flow-adjusted context.
8. **Watchlist:** stored in `localStorage` (wrapped in try/catch). Shown in a left rail or dropdown with each wallet's live equity and 24h PnL. Star buttons appear on every wallet link across the app (traders table, liquidations table, search results).
9. **Compare (2–3 wallets side by side):** column layout with the same KPI rows aligned (equity, realised PnL, win rate, profit factor, max drawdown, volume, ROI), an overlaid cumulative-PnL chart (one colour per wallet) and a "better" highlight per row. Reachable at `?view=wallet&address=A&compare=B,C`.
10. **Search:** accept full addresses, partial matches against the leaderboard, and account IDs. Show suggestions (recent, watched, top traders) when the field is empty.

If any of these metrics cannot be computed exactly, show the closest honest version with a label ("before fees", "since 11 Feb 2026", "exits only"). Never fabricate.

---

## Part 6 — Real-time where it matters
- Subscribe to **Perpl's public WebSocket** (see the API docs) for mark prices and market state. Live-update the market table, OI-by-market, the funding tile and **open-position mark price, uPnL and distance to liquidation on the wallet page**. Flash changed cells green or red for 600ms, respecting reduced motion.
- Keep the five-minute backend cycle for aggregates, and say so in the status pill ("Live prices · Aggregates every 5 min").
- Show a small "LIVE" dot when the socket is connected and "Delayed" when it falls back to polling.

---

## Part 7 — Performance, responsiveness, QA
- Code-split each tab. Lazy-load Recharts per chart. Memoise chart data. Do not re-render all charts on every one-second countdown tick: `now` in `usePerpl` currently updates every second at the top of the tree, so move the countdown into its own small component.
- At 390px: KPI grid in two columns, charts full width at 220px height, tables become horizontally scrollable with the first column sticky, and the filter bar becomes a bottom sheet.
- Lighthouse: performance ≥ 85, accessibility ≥ 95 on Overview.
- No horizontal page scroll at any width. No control overlap at 1024px. Verify the volume panel header specifically at 1024–1280px, where it currently wraps.

---

## Part 8 — Judge-facing finishing touches
- README: a hero screenshot or GIF of each tab, a one-paragraph "what makes this different", an architecture diagram (Perpl API + WebSocket + HyperSync/RPC → indexer → Supabase → Vercel), and a metric dictionary.
- Upgrade the in-app **"Data & methodology"** modal into a proper `/methodology` page with a definition for every metric, matching the `(i)` popovers.
- Add an Open Graph image and favicon set so shared links look good.
- Build a 60-second "demo path": land on Overview → click BTC → market drawer → click a liquidated wallet → wallet profile → Compare with a top trader. Make sure each step works from a cold load of the shared URL.

---

## Definition of done (checklist — tick each in the PR description)
- [ ] One `ChartCard` used by every time-series chart; filters left, display options right, Cumulative as a labelled switch, legend below the plot, `D/W/M` buckets plus a global `7D/30D/90D/YTD/All` range.
- [ ] Cumulative defaults as in 2.2; right axis labelled; partial bucket styled.
- [ ] Categorical palette (8 hues, CVD-checked), stable per-market colours, semantic green/red applied everywhere.
- [ ] No text below 11px; tabular numerals; one tooltip component; skeleton loaders; both themes verified.
- [ ] "PERPL PULSE" watermark removed; dead code removed; components formatted and split per tab.
- [ ] URL state for view/tab/range/market/wallet/compare.
- [ ] Overview KPIs with deltas and sparklines; TVL relabelled as a proxy; fees tile added.
- [ ] Every tab updated per Part 3.
- [ ] 4.A metrics shipped; 4.B items shipped or explicitly deferred with a reason and storage estimate; long/short skew shipped (exact or labelled proxy).
- [ ] Wallet page: trade history, realised PnL, win rate, profit factor, max drawdown, streaks, hold time, best/worst markets, watchlist, compare.
- [ ] WebSocket live prices on markets and wallet positions.
- [ ] All tests and type checks pass; screenshots at 1440/1024/390 in dark and light attached.
