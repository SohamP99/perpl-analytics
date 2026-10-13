import { useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
  const bins = [
    { name: "< −$100K", v: 0 },
    { name: "−$100K…−$10K", v: 0 },
    { name: "−$10K…$0", v: 0 },
    { name: "$0…$10K", v: 0 },
    { name: "$10K…$100K", v: 0 },
    { name: "> $100K", v: 0 },
  ];
  for (const r of all) {
    const v = Number(r.p) / 1e6;
    bins[
      v < -1e5 ? 0 : v < -1e4 ? 1 : v < 0 ? 2 : v < 1e4 ? 3 : v < 1e5 ? 4 : 5
    ].v++;
  }
  return (
    <>
      <div className="metric-grid three">
        <Metric
          title="Top 10 volume share"
          value={share(10) == null ? "—" : share(10)!.toFixed(1) + "%"}
          note="Listed wallets · all time"
        />
        <Metric
          title="Top 100 volume share"
          value={share(100) == null ? "—" : share(100)!.toFixed(1) + "%"}
          note="Listed wallets · all time"
        />
        <Metric
          title="Profitable wallets"
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
        <section className="panel">
          <h2>PnL distribution</h2>
          <div className="analytics-plot">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={bins}
                layout="vertical"
                margin={{ left: 15, right: 20 }}
              >
                <CartesianGrid horizontal={false} stroke="var(--border)" />
                <XAxis
                  type="number"
                  tick={{ fill: "var(--muted)", fontSize: 12 }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={{ fill: "var(--muted)", fontSize: 12 }}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--panel)",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                  }}
                />
                <Bar dataKey="v" name="Wallets" isAnimationActive={false}>
                  {bins.map((b, i) => (
                    <Cell
                      key={b.name}
                      fill={i < 3 ? "var(--red)" : "var(--green)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="chart-note">
            Zero-PnL wallets are in $0…$10K; excluded from profitable share.
          </p>
        </section>
        <section className="panel">
          <h2>PnL versus volume</h2>
          <div className="analytics-plot">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ left: 10, right: 20, top: 15 }}>
                <CartesianGrid stroke="var(--border)" />
                <XAxis
                  type="number"
                  dataKey="volume"
                  name="Volume"
                  scale="log"
                  domain={["auto", "auto"]}
                  tickFormatter={(v) => money(v)}
                  tick={{ fontSize: 12, fill: "var(--muted)" }}
                />
                <YAxis
                  type="number"
                  dataKey="pnl"
                  name="PnL"
                  tickFormatter={(v) => money(v)}
                  tick={{ fontSize: 12, fill: "var(--muted)" }}
                />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  contentStyle={{
                    background: "var(--panel)",
                    color: "var(--text)",
                  }}
                  formatter={(v) => money(Number(v))}
                />
                <Scatter
                  data={all
                    .filter((r) => Number(r.v) > 0)
                    .map((r) => ({
                      ...r,
                      volume: Number(r.v) / 1e6,
                      pnl: Number(r.p) / 1e6,
                    }))}
                  onClick={(r: any) => r.a && p.openWallet(r.a)}
                  isAnimationActive={false}
                >
                  {all
                    .filter((r) => Number(r.v) > 0)
                    .map((r) => (
                      <Cell
                        key={r.a}
                        fill={Number(r.r) < 0 ? "var(--red)" : "var(--green)"}
                      />
                    ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <p className="chart-note">
            Log volume axis · select a point or wallet below · leaderboard
            sample.
          </p>
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
