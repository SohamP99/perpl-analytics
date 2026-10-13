import { useEffect, useState } from "react";
import { Raw, pct, money } from "@/lib/perpl";
import { annualRate, fundingInterval, DAY } from "@/lib/analytics";
import { ChartCard } from "../chart-card";
import { Metric } from "../pulse-ui";
import { TabProps } from "../analytics-context";
import { localRead } from "../local-data";
export default function Risk(p: TabProps) {
  const [history, setHistory] = useState<Record<string, Raw[]>>({}),
    [market, setMarket] = useState("1"),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let stop = false;
    let running = false;
    const load = async () => {
      if (running) return;
      running = true;
      const queue = [...p.markets];
      let failures = 0;
      const worker = async () => {
        while (queue.length && !stop) {
          const m = queue.shift()!;
          try {
            const d = await localRead("funding-history?market=" + m.id);
            if (!stop) setHistory((old) => ({ ...old, [m.id]: d.rows || [] }));
          } catch {
            failures++;
          }
        }
      };
      await Promise.all([worker(), worker()]);
      running = false;
      if (!stop) {
        setLoading(false);
        setError(failures ? "Some funding histories unavailable. Retry" : "");
      }
    };
    load();
    window.addEventListener("perpl-sync", load);
    return () => {
      stop = true;
      window.removeEventListener("perpl-sync", load);
    };
  }, [p.markets.map((m) => m.id).join(",")]);
  const markets = p.markets
      .map((m): Raw => ({ ...m, apr: annualRate(m) }))
      .sort((a, b) => (b.apr ?? -Infinity) - (a.apr ?? -Infinity)),
    max = Math.max(...markets.map((m) => Math.abs(m.apr || 0)), 1),
    selected = p.markets.find((m) => String(m.id) === market),
    factor =
      fundingInterval(selected) > 0
        ? (365 * 86400) / fundingInterval(selected)
        : null,
    rows = (history[market] || []).map((r) => ({
      ...r,
      apr: factor == null ? null : r.rate * factor,
    })),
    days = Array.from(
      { length: 30 },
      (_, i) => Math.floor(Date.now() / DAY) * DAY - (29 - i) * DAY,
    ),
    oi = p.markets.reduce((s, m) => s + (m.oi || 0), 0),
    net = p.protocol ? p.protocol.deposits - p.protocol.withdrawals : 0;
  return (
    <>
      <div className="metric-grid three">
        <Metric
          title="Open interest / net deposits"
          value={net > 0 ? (oi / net).toFixed(2) + "×" : "—"}
          note="System leverage proxy · not account leverage"
        />
        <Metric
          title="Highest funding APR"
          value={pct(markets[0]?.apr)}
          note={markets[0]?.symbol + " · simple annualisation"}
        />
        <Metric
          title="Market collateral"
          value={money(p.markets.reduce((s, m) => s + (m.tvl || 0), 0))}
          note="Market API sum · different from TVL proxy"
        />
      </div>
      <div className="secondary-grid">
        <section className="panel">
          <h2>Annualised funding</h2>
          <div className="market-bars">
            {markets.map((m) => (
              <div key={m.id}>
                <button
                  className="wallet-link"
                  onClick={() => p.openMarket(String(m.id))}
                >
                  {m.symbol}
                </button>
                <div className="signed-track">
                  <span
                    style={{
                      left:
                        m.apr != null && m.apr < 0
                          ? `${50 - (Math.abs(m.apr) / max) * 50}%`
                          : "50%",
                      width: `${(Math.abs(m.apr || 0) / max) * 50}%`,
                      background:
                        m.apr != null && m.apr < 0
                          ? "var(--red)"
                          : "var(--green)",
                    }}
                  />
                </div>
                <span
                  className={m.apr != null && m.apr < 0 ? "red" : "green"}
                  title={`${pct(m.rate, 4)} / interval`}
                >
                  {pct(m.apr)}
                </span>
              </div>
            ))}
          </div>
          <p className="chart-note">
            Zero at centre · positive rates generally mean longs pay shorts.
          </p>
        </section>
        <ChartCard
          title="Funding APR history"
          loading={loading && !history[market]}
          data={rows}
          series={[{ key: "apr", label: "APR", aggregation: "mean" }]}
          unit="percent"
          kind="line"
          allowCumulative={false}
          source="Perpl funding API"
          note={"Last 30 days · " + error}
          filters={
            <select
              aria-label="Funding market"
              value={market}
              onChange={(e) => setMarket(e.target.value)}
            >
              {markets.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.symbol}
                </option>
              ))}
            </select>
          }
        />
      </div>
      <section className="panel">
        <h2>Funding heatmap</h2>
        <p className="chart-note">Daily funding APR · 30 days</p>
        {error && (
          <button
            className="secondary"
            onClick={() => window.dispatchEvent(new Event("perpl-sync"))}
          >
            {error}
          </button>
        )}
        <div className="table-wrap heatmap">
          <table>
            <thead>
              <tr>
                <th>Market</th>
                {days.map((d) => (
                  <th key={d}>{new Date(d).toISOString().slice(5, 10)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {markets.map((m) => (
                <tr key={m.id}>
                  <th>{m.symbol}</th>
                  {days.map((d) => {
                    const a = (history[m.id] || []).filter(
                        (r) => r.t >= d && r.t < d + DAY,
                      ),
                      v =
                        a.length && fundingInterval(m) > 0
                          ? ((a.reduce((s, r) => s + r.rate, 0) / a.length) *
                              365 *
                              86400) /
                            fundingInterval(m)
                          : null;
                    return (
                      <td
                        key={d}
                        style={
                          v != null
                            ? {
                                background: `color-mix(in srgb,${v < 0 ? "var(--red)" : "var(--green)"} ${Math.min(65, 10 + Math.abs(v))}%,var(--panel))`,
                              }
                            : {}
                        }
                      >
                        {v == null ? "—" : v.toFixed(1) + "%"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <h2>Price quality</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Market</th>
                <th>Mark / oracle basis</th>
                <th>Quoted spread</th>
              </tr>
            </thead>
            <tbody>
              {markets.map((m) => (
                <tr key={m.id}>
                  <td>{m.symbol}</td>
                  <td className={m.basis < 0 ? "red" : "green"}>
                    {pct(m.basis)}
                  </td>
                  <td>{m.spread?.toFixed(2) ?? "—"} bps</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
