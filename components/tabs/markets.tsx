import MarketShare from "../market-share";
import { MarketFilter } from "../market-filter";
import { useState } from "react";
import { Raw, money, price, pct } from "@/lib/perpl";
import { annualRate, marketColor, csv } from "@/lib/analytics";
import { ChartCard } from "../chart-card";
import { TabProps, useAnalytics } from "../analytics-context";
export function MarketTable({
  markets,
  openMarket,
}: {
  markets: Raw[];
  openMarket: (id: string) => void;
}) {
  const [sort, setSort] = useState("volume"),
    [direction, setDirection] = useState(-1),
    [search, setSearch] = useState("");
  const cols = [
    ["symbol", "Market"],
    ["price", "Mark"],
    ["change", "Price Δ 24h"],
    ["volume", "Volume 24h"],
    ["oi", "Open interest"],
    ["apr", "Funding APR"],
    ["leverage", "Max leverage"],
    ["spread", "Spread bps"],
    ["turnover", "Volume / OI"],
    ["tvl", "Market collateral"],
  ];
  const rows = markets
    .map((m): Raw => ({
      ...m,
      apr: annualRate(m),
      leverage: m.config?.initial_margin ? m.config.initial_margin / 100 : null,
      turnover: m.oi > 0 ? m.volume / m.oi : null,
    }))
    .filter((m) => m.symbol.toLowerCase().includes(search.toLowerCase()))
    .sort(
      (a: Raw, b: Raw) =>
        direction *
        (typeof a[sort] === "string"
          ? a[sort].localeCompare(b[sort])
          : (a[sort] ?? -Infinity) - (b[sort] ?? -Infinity)),
    );
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Market overview</h2>
        <div className="inline">
          <input
            aria-label="Filter markets"
            placeholder="Filter markets"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            className="secondary"
            onClick={() =>
              csv(
                "perpl-markets.csv",
                cols.map((c) => c[1]),
                rows.map((r: Raw) => cols.map((c) => r[c[0]])),
              )
            }
          >
            Export CSV
          </button>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {cols.map(([key, label]) => (
                <th
                  key={key}
                  aria-sort={
                    sort === key
                      ? direction === 1
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    onClick={() => {
                      setDirection(sort === key ? -direction : -1);
                      setSort(key);
                    }}
                  >
                    {label} {sort === key ? (direction === 1 ? "↑" : "↓") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td>
                  <button
                    className="wallet-link"
                    onClick={() => openMarket(String(m.id))}
                  >
                    <span
                      className="asset-icon"
                      style={{ color: marketColor(m.id) }}
                    >
                      {m.symbol.slice(0, 1)}
                    </span>
                    {m.symbol}
                  </button>
                </td>
                <td className="live-number">{price(m.price)}</td>
                <td className={m.change < 0 ? "red" : "green"}>
                  {pct(m.change)}
                </td>
                <td>{money(m.volume)}</td>
                <td>{money(m.oi)}</td>
                <td
                  className={m.apr != null && m.apr < 0 ? "red" : "green"}
                  title={`${pct(m.rate, 4)} per ${m.funding_interval_sec / 60} minutes; simple annualisation, not expected return`}
                >
                  {pct(m.apr)}
                </td>
                <td>{m.leverage ?? "—"}×</td>
                <td>{m.spread?.toFixed(2) ?? "—"}</td>
                <td>{m.turnover?.toFixed(2) ?? "—"}×</td>
                <td>{money(m.tvl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
export default function Markets(p: TabProps) {
  const [market, setMarket] = useState("all"),
    [share, setShare] = useState("volume"),
    chosen = p.chartMarkets.filter(
      (m) => market === "all" || String(m.id) === market,
    ),
    sum = p.markets.reduce((s, m) => s + (m[share] || 0), 0);
  return (
    <>
      <div className="secondary-grid">
        <ChartCard
          title="Volume by market"
          filters={
            <MarketFilter
              title="Volume by market"
              markets={p.chartMarkets}
              value={market}
              onChange={setMarket}
            />
          }
          data={p.volumeDaily}
          series={chosen.map((m) => ({
            key: "m" + m.id,
            label: m.symbol,
            color: marketColor(m.id),
          }))}
          stack
          percentStack
          loading={p.loading}
          source="Perpl API candles"
          note={p.chartError}
        />
        <section className="panel">
          <div className="panel-head">
            <h2>Market share</h2>
            <div className="period-picker">
              {["volume", "oi"].map((k) => (
                <button
                  key={k}
                  className={share === k ? "active" : ""}
                  onClick={() => setShare(k)}
                >
                  {k === "volume" ? "Volume 24h" : "Current OI"}
                </button>
              ))}
            </div>
          </div>
          <MarketShare
            markets={p.markets}
            metric={share}
            openMarket={p.openMarket}
          />
        </section>
      </div>
      <MarketTable markets={p.markets} openMarket={p.openMarket} />
    </>
  );
}
