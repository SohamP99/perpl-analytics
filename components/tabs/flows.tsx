import { money, Raw, short } from "@/lib/perpl";
import { inRange, total, rangeStart } from "@/lib/analytics";
import { ChartCard } from "../chart-card";
import { Metric } from "../pulse-ui";
import { TabProps, useAnalytics } from "../analytics-context";
export default function Flows(p: TabProps) {
  const { range, end } = useAnalytics(),
    daily = (p.protocol?.daily || []).map((r: Raw) => ({
      ...r,
      out: -r.withdrawals,
    })),
    rows = daily,
    deposits = total(rows, "deposits"),
    n = total(rows, "depositCount"),
    baseline = daily
      .filter((r: Raw) => r.t < rangeStart(range, end))
      .reduce((s: number, r: Raw) => s + r.v, 0);
  return (
    <>
      <div className="metric-grid">
        <Metric
          title="Deposits (all time)"
          value={money(deposits)}
          note={`${n?.toLocaleString() ?? "—"} deposits · ${range}`}
        />
        <Metric
          title="Withdrawals (all time)"
          value={money(total(rows, "withdrawals"))}
          note={`${total(rows, "withdrawalCount")?.toLocaleString() ?? "—"} withdrawals · ${range}`}
        />
        <Metric
          title="Average deposit (all time)"
          value={money(n && deposits != null ? deposits / n : null)}
          note="Amount / event count"
        />
        <Metric
          title="Net inflows (all time)"
          value={money(total(rows, "v"))}
          note={`${range} · all markets`}
        />
      </div>
      <ChartCard
        title="Net capital inflows"
        data={daily}
        series={[{ key: "v", label: "Net flow", signed: true }]}
        cumulative
        baseline={baseline}
        definition="Bars are interval net flows; cumulative line includes deposits retained before the selected range and is a TVL proxy."
      />
      <ChartCard
        title="Deposits and withdrawals"
        data={daily}
        series={[
          { key: "deposits", label: "Deposits", color: "var(--green)" },
          { key: "out", label: "Withdrawals", color: "var(--red)" },
        ]}
        stack
        note="Withdrawals below zero · all markets"
      />
      <section className="panel">
        <h2>Recent capital movements</h2>
        <p className="chart-note">
          Forward-only collection · latest 100 available records · up to 7 days.
          Historical totals above are preserved.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time UTC</th>
                <th>Account</th>
                <th>Type</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {(p.analytics?.flows || []).map((r: Raw) => (
                <tr key={r.id}>
                  <td>
                    {new Date(r.time)
                      .toISOString()
                      .replace("T", " ")
                      .slice(0, 19)}
                  </td>
                  <td>
                    {r.address ? (
                      <button
                        className="wallet-link"
                        onClick={() => p.openWallet(r.address)}
                      >
                        {short(r.address)}
                      </button>
                    ) : (
                      "#" + r.account
                    )}
                  </td>
                  <td className={r.kind === "Deposit" ? "green" : "red"}>
                    {r.kind}
                  </td>
                  <td>{money(Number(r.amount) / 1e6, false)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!p.analytics?.flows?.length && (
            <p className="chart-empty">
              No new capital movements collected yet.
            </p>
          )}
        </div>
      </section>
    </>
  );
}
