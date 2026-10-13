import { useState, useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { traderGroups } from "@/lib/dashboard-math";
import { Raw, money, pct, short } from "@/lib/perpl";
import { Metric } from "../pulse-ui";
import { TabProps } from "../analytics-context";
export default function Traders(p: TabProps) {
  const [sort, setSort] = useState("v"),
    [dir, setDir] = useState(-1),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(0),
    all = (p.leaderboard?.data?.d || []) as Raw[],
    rows = all
      .filter((r) => r.a.includes(search.toLowerCase()))
      .sort((a, b) => dir * (Number(a[sort]) - Number(b[sort]))),
    volume = all.reduce((s, r) => s + Number(r.v), 0),
    rank = [...all].sort((a, b) => Number(b.v) - Number(a.v)),
    share = (n: number) =>
      volume
        ? (rank.slice(0, n).reduce((s, r) => s + Number(r.v), 0) / volume) * 100
        : null;
  const groups = useMemo(() => traderGroups(all), [p.leaderboard]);
  const count = groups.reduce((n, g) => n + g.wallets, 0),
    groupVolume = groups.reduce((n, g) => n + g.volume, 0);
  return (
    <>
      <div className="metric-grid three">
        <Metric
          title="Top 10 volume share (all time)"
          value={share(10) == null ? "—" : share(10)!.toFixed(1) + "%"}
          note="Listed wallets · all time"
        />
        <Metric
          title="Top 100 volume share (all time)"
          value={share(100) == null ? "—" : share(100)!.toFixed(1) + "%"}
          note="Listed wallets · all time"
        />
        <Metric
          title="Profitable wallets (all time)"
          value={
            all.length
              ? (
                  (all.filter((r) => Number(r.p) > 0).length / all.length) *
                  100
                ).toFixed(1) + "%"
              : "—"
          }
          note="Listed wallets · PnL > 0"
        />
      </div>
      <div className="secondary-grid">
        <section className="panel trader-summary">
          <div className="panel-head">
            <h2>Wallet profitability</h2>
            <span className="muted">All time</span>
          </div>
          <div className="profitability-total">
            <strong>{count.toLocaleString()}</strong>
            <span>Listed wallets</span>
          </div>
          <div className="profitability-bars">
            {groups.map((g) => (
              <div key={g.name}>
                <div>
                  <b>{g.name}</b>
                  <span>
                    {g.wallets.toLocaleString()}{" "}
                    <em>
                      {count ? ((g.wallets / count) * 100).toFixed(1) : "0"}%
                    </em>
                  </span>
                </div>
                <div className="profit-track">
                  <span
                    style={{
                      width: (count ? (g.wallets / count) * 100 : 0) + "%",
                      background: g.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="panel trader-summary">
          <div className="panel-head">
            <h2>Volume by wallet profitability</h2>
            <span className="muted">All time</span>
          </div>
          <div className="profitability-donut">
            <div className="donut-plot">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={groups}
                    dataKey="volume"
                    nameKey="name"
                    innerRadius="65%"
                    outerRadius="90%"
                    isAnimationActive={false}
                    stroke="var(--panel)"
                    strokeWidth={3}
                  >
                    {groups.map((g) => (
                      <Cell key={g.name} fill={g.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }: any) => {
                      if (!active || !payload?.length) return null;
                      const g = payload[0].payload;
                      return (
                        <div className="unified-tooltip">
                          <b>{g.name} wallets</b>
                          <div>
                            <span>Volume</span>
                            <strong>{money(g.volume)}</strong>
                          </div>
                          <div>
                            <span>Share</span>
                            <strong>
                              {groupVolume
                                ? ((g.volume / groupVolume) * 100).toFixed(1)
                                : 0}
                              %
                            </strong>
                          </div>
                          <div>
                            <span>Wallets</span>
                            <strong>{g.wallets.toLocaleString()}</strong>
                          </div>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="profitability-legend">
              {groups.map((g) => (
                <div key={g.name}>
                  <b>
                    <i style={{ background: g.color }} />
                    {g.name}
                  </b>
                  <strong>{money(g.volume)}</strong>
                  <span>
                    {groupVolume
                      ? ((g.volume / groupVolume) * 100).toFixed(1)
                      : 0}
                    %
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
      <section className="panel">
        <div className="panel-head">
          <h2>Top traders</h2>
          <input
            aria-label="Filter traders"
            placeholder="Search wallet"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>
                  Rank by{" "}
                  {sort === "v" ? "volume" : sort === "p" ? "PnL" : "ROI"}
                </th>
                <th>Wallet</th>
                {[
                  ["p", "All-time PnL"],
                  ["r", "ROI"],
                  ["v", "Volume"],
                ].map(([key, label]) => (
                  <th key={key}>
                    <button
                      onClick={() => {
                        setSort(key);
                        setDir(sort === key ? -dir : -1);
                        setPage(0);
                      }}
                    >
                      {label} {sort === key ? (dir === -1 ? "↓" : "↑") : ""}
                    </button>
                  </th>
                ))}
                <th>Watch</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(page * 20, page * 20 + 20).map((r, i) => (
                <tr key={r.a}>
                  <td>{page * 20 + i + 1}</td>
                  <td>
                    <button
                      className="wallet-link"
                      onClick={() => p.openWallet(r.a)}
                    >
                      {short(r.a)}
                    </button>
                  </td>
                  <td className={Number(r.p) < 0 ? "red" : "green"}>
                    {money(Number(r.p) / 1e6)}
                  </td>
                  <td>{pct(Number(r.r) / 100)}</td>
                  <td>{money(Number(r.v) / 1e6)}</td>
                  <td>
                    <button
                      aria-label={"Watch " + r.a}
                      aria-pressed={p.watch.includes(r.a)}
                      onClick={() => p.toggleWatch(r.a)}
                    >
                      {p.watch.includes(r.a) ? "★" : "☆"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pagination">
          <span>{rows.length} listed wallets</span>
          <div>
            <button
              className="secondary"
              disabled={!page}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            <span>{page + 1}</span>
            <button
              className="secondary"
              disabled={(page + 1) * 20 >= rows.length}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
