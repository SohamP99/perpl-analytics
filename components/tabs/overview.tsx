import { money, Raw } from "@/lib/perpl";
import { delta, inRange, marketColor, total } from "@/lib/analytics";
import { ChartCard } from "../chart-card";
import { Metric } from "../pulse-ui";
import { TabProps, useAnalytics } from "../analytics-context";
export default function Overview(p: TabProps) {
  const { range, end, market } = useAnalytics(),
    daily = p.protocol?.daily || [],
    rows = inRange(daily, range, end),
    vol = p.volumeDaily.map((r) => ({
      ...r,
      v: market === "all" ? r.v : r["m" + market],
    })),
    oi =
      p.markets.length && p.markets.every((m) => m.oi != null)
        ? p.markets.reduce((s, m) => s + m.oi, 0)
        : null;
  const feeRows = daily.map((r: Raw) => ({
      ...r,
      netTradingFees: r.fees - r.builderFees,
      allFees: r.fees + r.protocolFees + r.insuranceFees,
    })),
    growth = daily.map((r: Raw) => ({
      ...r,
      dau: p.analytics?.activity.find((a: Raw) => a.t === r.t)?.dau,
    })),
    activity = p.protocol?.activity24h,
    net = p.protocol ? p.protocol.deposits - p.protocol.withdrawals : null;
  const feeSeries = [
    { key: "netTradingFees", label: "Trading excluding builder" },
    { key: "builderFees", label: "Builder" },
    { key: "protocolFees", label: "Protocol" },
    { key: "insuranceFees", label: "Insurance" },
  ];
  return (
    <>
      <div className="metric-grid">
        <Metric
          title={`${range} volume`}
          value={money(total(inRange(vol, range, end), "v"))}
          loading={p.loading}
          change={delta(vol, "v", range, end)}
          trend={inRange(vol, range, end)
            .slice(-30)
            .map((r) => r.v)}
          note="Public candles · selected markets"
        />
        <Metric
          title="Open interest"
          value={money(oi)}
          note="Current market snapshot"
          definition="Open outstanding notional at current mark prices. No historical delta until comparable snapshots exist."
        />
        <Metric
          title="Net deposits (TVL proxy)"
          value={money(net)}
          note="Cumulative · all markets"
          definition="Collateral deposits less withdrawals. Excludes trader PnL; not the market collateral sum."
        />
        <Metric
          title="Fees collected"
          value={money(total(inRange(feeRows, range, end), "allFees"))}
          loading={!p.protocol}
          change={delta(feeRows, "allFees", range, end)}
          trend={inRange(feeRows, range, end)
            .slice(-30)
            .map((r: Raw) => r.allFees)}
          note={`${range} · all fee categories`}
          definition="Trading fees (including builder share) plus protocol and insurance position fees. Not net revenue."
        />
      </div>
      <div className="metric-grid">
        <Metric
          title="Active traders"
          value={
            activity?.activeUsers == null
              ? "—"
              : Number(activity.activeUsers).toLocaleString()
          }
          note={
            activity?.mode === "rolling"
              ? "24h · distinct accounts"
              : "Latest complete UTC day"
          }
        />
        <Metric
          title="New accounts"
          value={total(rows, "newUsers")?.toLocaleString() ?? "—"}
          change={delta(daily, "newUsers", range, end)}
          note={`${range} registrations · not people`}
        />
        <Metric
          title="Net flow"
          value={money(total(rows, "v"))}
          note={`${range} · all markets`}
        />
        <Metric
          title="Liquidations"
          value={total(rows, "liquidations")?.toLocaleString() ?? "—"}
          note={`${range} event count · partial exits included`}
        />
      </div>
      <div className="chart-grid">
        <ChartCard
          title="Total volume"
          data={vol}
          series={[{ key: "v", label: "Volume" }]}
          cumulative
          loading={p.loading}
          source="Perpl API candles"
          note={p.chartError}
        />
        <section className="panel">
          <div className="panel-head">
            <h2>Open interest by market</h2>
            <span className="muted">Current</span>
          </div>
          <div className="composition-bar">
            {p.markets.map((m) => (
              <span
                key={m.id}
                style={{
                  width: `${oi ? (m.oi / oi) * 100 : 0}%`,
                  background: marketColor(m.id),
                }}
                title={`${m.symbol}: ${money(m.oi)}`}
              />
            ))}
          </div>
          <div className="rank-list">
            {[...p.markets]
              .sort((a, b) => b.oi - a.oi)
              .slice(0, 8)
              .map((m) => (
                <button key={m.id} onClick={() => p.openMarket(String(m.id))}>
                  <span>
                    <i style={{ background: marketColor(m.id) }} />
                    {m.symbol}
                  </span>
                  <b>{money(m.oi)}</b>
                  <em>{oi ? ((m.oi / oi) * 100).toFixed(1) : "—"}%</em>
                </button>
              ))}
          </div>
          <p className="chart-note">
            Select a market to explore prices and funding.
          </p>
        </section>
      </div>
      <div className="secondary-grid">
        <ChartCard
          title="Fees collected"
          data={feeRows}
          series={feeSeries}
          stack
          cumulative
          note="All markets · independent recorded fee categories"
        />
        <ChartCard
          title="User growth"
          data={growth}
          series={[{ key: "newUsers", label: "Registrations" }]}
          unit="count"
          cumulative
          note="All markets · AccountCreated events"
        />
      </div>
    </>
  );
}
