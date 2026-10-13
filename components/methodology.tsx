import { Raw } from "@/lib/perpl";
const metrics = [
  [
    "Volume",
    "Sum of public candle notional in the selected period. 24h market values are supplied by Perpl. Missing markets are labelled partial.",
  ],
  [
    "Open interest",
    "Outstanding size multiplied by current mark, with the market size and price scales.",
  ],
  [
    "Net deposits (TVL proxy)",
    "Cumulative collateral deposits less withdrawals. Excludes trader PnL; not equivalent to market collateral.",
  ],
  [
    "Market collateral",
    "The API state.tvl value after collateral-token scaling; shown separately from net deposits.",
  ],
  [
    "Fees collected",
    "Trading fees, which already include the builder share, plus protocol and insurance position fees. Charts subtract the builder share from trading before stacking. Not net protocol revenue.",
  ],
  [
    "Effective fee rate",
    "Trading fees / same-day candle volume × 10,000. A proxy affected by source coverage.",
  ],
  [
    "Fee run-rate",
    "Trailing 30 UTC days of recorded fees × 365/30. Extrapolation, not a revenue forecast.",
  ],
  [
    "New accounts",
    "AccountCreated event count. Registrations are not unique people.",
  ],
  [
    "DAU / WAU / MAU",
    "Distinct account IDs with fills on the latest day, or in the 7 / 30 UTC days ending on each date.",
  ],
  ["Stickiness", "DAU divided by MAU."],
  [
    "New / returning",
    "New means first recorded fill date; returning means a later recorded fill day.",
  ],
  [
    "Retention",
    "Account cohort grouped by first recorded fill week. Percentage active in each subsequent week; incomplete weeks marked.",
  ],
  [
    "Fills",
    "Maker and taker event counts; do not add them and label the result unique trades.",
  ],
  [
    "Flow statistics",
    "Amounts and event counts for collateral deposits and withdrawals. Recent detail collection starts with this release; full daily totals remain preserved.",
  ],
  [
    "Liquidation count",
    "PositionLiquidated event count, including partial liquidations.",
  ],
  [
    "Liquidated notional",
    "Execution price × liquidated size, using market scaling. Detailed history is incomplete and distinct from full event-count coverage.",
  ],
  [
    "Liquidation loss",
    "deltaPnlCNS on available liquidation records; not all wallet losses or net-of-fee performance.",
  ],
  [
    "Funding APR",
    "Interval rate × (365 × 86,400 / interval seconds). Simple annualisation, not an expected return.",
  ],
  [
    "Basis / spread",
    "(mark/oracle − 1) × 100; (ask − bid)/mid × 10,000 basis points.",
  ],
  [
    "Trader concentration",
    "Top listed leaderboard wallets’ share of listed volume. Not necessarily every protocol wallet.",
  ],
  [
    "Wallet performance",
    "All-time PnL, volume, ROI and rank supplied by the public Perpl leaderboard. Not reconstructed realised trade PnL.",
  ],
  [
    "Wallet equity",
    "Snapshot balance + collateral + mark-adjusted unrealized PnL. New trades and funding changes can lag the five-minute contract refresh.",
  ],
  [
    "Wallet leverage / distance",
    "Current notional / estimated equity; absolute mark-to-estimated-liquidation gap / mark. These are estimates, not risk guarantees.",
  ],
];
export default function Methodology({ protocol }: { protocol: Raw | null }) {
  return (
    <>
      <section className="panel">
        <h2>Sources and coverage</h2>
        <p>
          Perpl public market data and WebSocket, public Monad contract reads,
          imported Dune summaries through 12 October 2026, and periodic
          HyperSync/RPC summaries thereafter. There are no recurring Dune API
          calls.
        </p>
        <p>
          Aggregates refresh every five minutes. Perpl currently rejects this
          website's WebSocket origin; market prices fall back to those
          snapshots. The streaming client activates only when the provider
          permits the connection. Live marks do not imply live wallet positions.
          Indexed through{" "}
          {protocol?.coverage?.throughTime
            ? new Date(protocol.coverage.throughTime).toISOString()
            : "unavailable"}
          .
        </p>
        <p>
          Unavailable values appear as —. Historical detail cannot be
          reconstructed from daily totals. The global market filter only applies
          to data with a market dimension. Historical wallet trades, exact
          directional OI, insurance balances, builder attribution and conversion
          rates are deferred until complete supporting data exists.
        </p>
      </section>
      <section className="panel">
        <h2>Metric dictionary</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Metric</th>
                <th>Definition</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map(([name, text]) => (
                <tr key={name}>
                  <th>{name}</th>
                  <td className="definition-cell">{text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <h2>Storage and updates</h2>
        <p>
          Daily historical summaries and account activity are retained. API
          caches are bounded to 8 MiB of serialized payload and 512 entries. New
          market state is sampled hourly with a 90-day window; recent flow
          details retain at most 1,000 records / seven days. A 400 MiB database
          guard preserves the checkpoint when indexing must pause.
        </p>
        <p>
          Funding history currently displays 30 days. Earlier API pagination is
          a separate backfill; no earlier observations are fabricated. Raw
          blocks and all-wallet trade-event history are not stored.
        </p>
      </section>
    </>
  );
}
