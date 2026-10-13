import { Raw } from "@/lib/perpl";
import { ChartCard } from "../chart-card";
import { Metric } from "../pulse-ui";
import { TabProps } from "../analytics-context";
export default function Growth(p: TabProps) {
  const activity = p.analytics?.activity || [],
    last = activity.at(-1),
    cohorts = p.analytics?.cohorts || [],
    weeks = [...new Set(cohorts.map((r: Raw) => r.cohort))] as string[];
  const transactions = p.analytics?.transactions,
    txDays = new Map<number,Raw>((transactions?.daily || []).map((r:Raw)=>[r.t,r])),
    activityDays = new Map<number,Raw>(activity.map((r:Raw)=>[r.t,r])),
    daily = [...new Set([...activityDays.keys(),...txDays.keys()])].sort((a,b)=>a-b).map(t=>({
      t, transactions:txDays.get(t)?.count ?? null,
      dau:activityDays.get(t)?.dau ?? null, partial:txDays.get(t)?.partial,
    }));
  return (
    <>
      <div className="metric-grid three">
        <Metric
          title={
            p.protocol?.activity24h?.mode === "rolling"
              ? "Active traders (24h)"
              : "Active traders (yesterday)"
          }
          value={p.protocol?.activity24h?.activeUsers?.toLocaleString() ?? "—"}
          note="Latest recorded UTC day"
        />
        <Metric
          title="Users (all time)"
          value={p.protocol?.newAccounts?.toLocaleString() ?? "—"}
          note="Rolling 7 UTC days"
        />
        <Metric
          title="Stickiness (DAU / MAU)"
          value={
            last?.stickiness != null ? last.stickiness.toFixed(1) + "%" : "—"
          }
          note="DAU / MAU"
        />
      </div>
      <div className="secondary-grid">
        <ChartCard
          title="Daily transactions & users"
          data={daily}
          series={[
            { key: "transactions", label: "Trading transactions", kind: "bar" },
            { key: "dau", label: "Active users", kind:"line", axis:"right", aggregation: "last", color:"var(--cat-2)" },
          ]}
          unit="count"
          buckets={false}
          leftLabel="Transactions"
          rightLabel="Users"
          filters={<span className="muted">{transactions?.from ? "Transactions since " + new Date(transactions.from.time).toLocaleDateString("en-GB",{day:"numeric",month:"short",timeZone:"UTC"}) : "Transaction tracking starting"}</span>}
          note="Trading transactions are distinct on-chain transactions containing fills. Historical CSVs contain fill counts, not transaction counts. Earlier transaction values are unavailable; the first tracking day is partial. Users are distinct active trading accounts per UTC day."
          allowCumulative={false}
          loading={!p.analytics}
        />
        <ChartCard
          title="New and returning traders"
          allowCumulative={false}
          data={activity}
          series={[
            { key: "new", label: "New", aggregation: "mean" },
            { key: "returning", label: "Returning", aggregation: "mean" },
          ]}
          unit="daily-traders"
          stack
          note="New means first fill in covered history. Weekly and monthly buckets show average daily traders, not unique traders summed across days."
        />
        <ChartCard
          title="Maker and taker fills"
          allowCumulative={false}
          data={p.protocol?.daily || []}
          series={[
            { key: "makerFills", label: "Maker" },
            { key: "takerFills", label: "Taker" },
          ]}
          unit="count"
          stack
          note="Separate fill events; not additive unique trades"
        />
        <ChartCard
          title="Fills per active account"
          data={activity}
          series={[
            {
              key: "fillsPerTrader",
              label: "Fills / active account",
              aggregation: "mean",
            },
          ]}
          unit="count"
          kind="line"
          allowCumulative={false}
        />
      </div>
      <section className="panel">
        <h2>Weekly retention cohorts</h2>
        <p className="chart-note">Weekly return rate · * partial week</p>
        <div className="table-wrap heatmap">
          <table>
            <thead>
              <tr>
                <th>First fill week</th>
                <th>Accounts</th>
                {Array.from(
                  {
                    length: Math.max(1, ...cohorts.map((r: Raw) => r.age + 1)),
                  },
                  (_, i) => (
                    <th key={i}>W{i}</th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week) => {
                const cells = cohorts.filter((c: Raw) => c.cohort === week),
                  max = Math.floor(
                    ((last?.t ?? 0) - Date.parse(week)) / 604800000,
                  );
                return (
                  <tr key={week}>
                    <th>{week}</th>
                    <td>{cells[0]?.size}</td>
                    {Array.from(
                      {
                        length: Math.max(
                          1,
                          ...cohorts.map((r: Raw) => r.age + 1),
                        ),
                      },
                      (_, i) => {
                        const c = cells.find((r: Raw) => r.age === i),
                          value = c
                            ? (c.active / c.size) * 100
                            : i <= max
                              ? 0
                              : null;
                        return (
                          <td
                            key={i}
                            style={
                              value != null
                                ? {
                                    background: `color-mix(in srgb,var(--purple) ${Math.max(8, value)}%,var(--panel))`,
                                  }
                                : {}
                            }
                            title={
                              value == null
                                ? "Future cohort week"
                                : `${value.toFixed(1)}% active`
                            }
                          >
                            {value == null
                              ? "—"
                              : Math.round(value) +
                                "%" +
                                (i === max ? "*" : "")}
                          </td>
                        );
                      },
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!weeks.length && (
          <p className="chart-empty">
            Activity analytics are loading or temporarily unavailable.
          </p>
        )}
      </section>
      <p className="chart-note">
        Top 1% of accounts contribute{" "}
        {p.analytics?.concentration?.toFixed(1) ?? "—"}% of recorded fills.
      </p>
    </>
  );
}
