# Release verification — 13 October 2026

Production: https://perpl-analytics.vercel.app

## Automated checks
TypeScript, production web build, proxy/security tests, full cloud historical-seed parity, transactional replay/checkpoint, writer lease, durable cooldown, cache bounds, Vercel routes, and new activity/cohort/snapshot guards passed.

The original rolling activity join exceeded Supabase's four-second statement timeout. It was replaced with per-account activity intervals and a cumulative count over date boundaries. This version succeeded against the live database (about 3.1 seconds including network and all analytics queries). Response size approximately 74 KB; five-minute shared cache.

## Hosted UI verification
Eight protocol tabs × 1440/1024/390 px × dark/light = 48 checks. All reported document width at or below viewport width. Screenshot image width excludes the browser's scrollbar. Initial resize attempts against an older browser tab failed; final checks used a fresh tab and explicitly measured innerWidth. Baselines were recaptured from the preceding deployment at the requested sizes.

Also verified: weekly buckets, cumulative toggle, 30-day URL state, market drawer, liquidation → wallet navigation, command search, watch/unwatch, two-wallet comparison, populated funding history and chart table/CSV export. The original test wallet shows a 0.00021 BTC position and leaderboard PnL −$199.53. PNG export is implemented but was not download-verified. Automated Lighthouse scores and formal CVD simulation are not claimed.

## Data preservation and operation
All historical rows compared with the saved pre-optimization backup were retained; seed unchanged. Checkpoint advanced from 113028235 to 113066982 at the verification checkpoint. Supabase's five-minute cron returned HTTP 200/caught-up after deployment. Database measured 29,922,995 bytes (~28.5 MiB); API cache 2,297,253 bytes (~2.2 MiB). The 400 MiB guard is unchanged. New snapshots and recent-detail tables are additive and bounded; permanent daily aggregates are not pruned.

## Provider limitation
A server-side WebSocket probe succeeds, but the same handshake with Origin https://perpl-analytics.vercel.app returns HTTP 403. The app labels prices delayed and uses five-minute snapshots. Connection attempts are bounded. Perpl origin approval or a separate relay is required for live browser streaming; no paid relay was added.

## Deliberately deferred
Full wallet trade history/performance, exact long/short OI, builder rankings, depositor uniqueness, insurance/ADL history, and registration conversion require missing historical event data. Current market selector is single-select. OI history is forward-only. These are not marked as completed. Free-tier usage is bounded, not unlimited.

## Screenshot gallery
| View | 1440 dark | 1440 light | 1024 dark | 1024 light | 390 dark | 390 light |
|---|---|---|---|---|---|---|
| Previous Overview | [Before](before-1440-dark.png) | [Before](before-1440-light.png) | [Before](before-1024-dark.png) | [Before](before-1024-light.png) | [Before](before-390-dark.png) | [Before](before-390-light.png) |
| Overview | [View](final-overview-1440-dark.png) | [View](final-overview-1440-light.png) | [View](final-overview-1024-dark.png) | [View](final-overview-1024-light.png) | [View](final-overview-390-dark.png) | [View](final-overview-390-light.png) |
| Markets | [View](final-markets-1440-dark.png) | [View](final-markets-1440-light.png) | [View](final-markets-1024-dark.png) | [View](final-markets-1024-light.png) | [View](final-markets-390-dark.png) | [View](final-markets-390-light.png) |
| Fees | [View](final-fees-1440-dark.png) | [View](final-fees-1440-light.png) | [View](final-fees-1024-dark.png) | [View](final-fees-1024-light.png) | [View](final-fees-390-dark.png) | [View](final-fees-390-light.png) |
| Capital flows | [View](final-capital-flows-1440-dark.png) | [View](final-capital-flows-1440-light.png) | [View](final-capital-flows-1024-dark.png) | [View](final-capital-flows-1024-light.png) | [View](final-capital-flows-390-dark.png) | [View](final-capital-flows-390-light.png) |
| Users & activity | [View](final-users-activity-1440-dark.png) | [View](final-users-activity-1440-light.png) | [View](final-users-activity-1024-dark.png) | [View](final-users-activity-1024-light.png) | [View](final-users-activity-390-dark.png) | [View](final-users-activity-390-light.png) |
| Risk & funding | [View](final-risk-funding-1440-dark.png) | [View](final-risk-funding-1440-light.png) | [View](final-risk-funding-1024-dark.png) | [View](final-risk-funding-1024-light.png) | [View](final-risk-funding-390-dark.png) | [View](final-risk-funding-390-light.png) |
| Traders | [View](final-traders-1440-dark.png) | [View](final-traders-1440-light.png) | [View](final-traders-1024-dark.png) | [View](final-traders-1024-light.png) | [View](final-traders-390-dark.png) | [View](final-traders-390-light.png) |
| Liquidations | [View](final-liquidations-1440-dark.png) | [View](final-liquidations-1440-light.png) | [View](final-liquidations-1024-dark.png) | [View](final-liquidations-1024-light.png) | [View](final-liquidations-390-dark.png) | [View](final-liquidations-390-light.png) |
