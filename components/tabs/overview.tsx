import { useState } from "react";
import { MarketFilter } from "../market-filter";
import { money, Raw } from "@/lib/perpl";
import { delta, inRange, marketColor, total } from "@/lib/analytics";
import { ChartCard } from "../chart-card";
import { Metric } from "../pulse-ui";
import { TabProps, useAnalytics } from "../analytics-context";
export default function Overview(p: TabProps) {
  const [market, setMarket] = useState("all");
  const { range, end } = useAnalytics(),
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
          title="Volume (24h)"
          value={money(
            p.markets.length && p.markets.every((m) => m.volume != null)
              ? p.markets.reduce((s, m) => s + m.volume, 0)
              : null,
          )}
          loading={!p.markets.length}
        />
        <Metric title="Open interest" value={money(oi)} />
        <Metric title="Total value locked" value={money(net)} />
        <Metric
          title="Fees collected (all time)"
          value={money(
            p.protocol
              ? p.protocol.fees +
                  p.protocol.positionProtocolFees +
                  p.protocol.insuranceFees
              : null,
          )}
          loading={!p.protocol}
        />
        <Metric
          title={
            activity?.mode === "rolling"
              ? "Active traders (24h)"
              : "Active traders (yesterday)"
          }
          value={activity?.activeUsers?.toLocaleString() ?? "—"}
        />
        <Metric
          title="Users (all time)"
          value={p.protocol?.newAccounts?.toLocaleString() ?? "—"}
        />
        <Metric
          title={
            activity?.mode === "rolling"
              ? "Net flow (24h)"
              : "Net flow (yesterday)"
          }
          value={money(
            activity ? activity.deposits - activity.withdrawals : null,
          )}
        />
        <Metric
          title="Liquidations (all time)"
          value={p.protocol?.liquidations?.toLocaleString() ?? "—"}
        />
      </div>
      <div className="chart-grid">
        <ChartCard
          title="Total volume"
          filters={
            <MarketFilter
              title="Total volume"
              markets={p.chartMarkets}
              value={market}
              onChange={setMarket}
            />
          }
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
