import { Raw } from "@/lib/perpl";
import { ChartCard } from "../chart-card";
import { Metric } from "../pulse-ui";
import { TabProps } from "../analytics-context";
export default function Growth(p: TabProps) {
  const activity = p.analytics?.activity || [],
    last = activity.at(-1),
    cohorts = p.analytics?.cohorts || [],
    weeks = [...new Set(cohorts.map((r: Raw) => r.cohort))] as string[];
  return (
    <>
      <div className="metric-grid">
        <Metric
          title="Daily active accounts"
          value={last?.dau?.toLocaleString() ?? "—"}
          note="Latest recorded UTC day"
        />
        <Metric
          title="Weekly active accounts"
          value={last?.wau?.toLocaleString() ?? "—"}
          note="Rolling 7 UTC days"
        />
        <Metric
          title="Monthly active accounts"
          value={last?.mau?.toLocaleString() ?? "—"}
          note="Rolling 30 UTC days"
        />
        <Metric
          title="Stickiness"
          value={
            last?.stickiness != null ? last.stickiness.toFixed(1) + "%" : "—"
          }
          note="DAU / MAU"
        />
      </div>
      <div className="secondary-grid">
        <ChartCard
          title="Active accounts"
          data={activity}
          series={[
            { key: "dau", label: "DAU", aggregation: "last" },
            { key: "wau", label: "WAU", aggregation: "last" },
            { key: "mau", label: "MAU", aggregation: "last" },
          ]}
          unit="count"
          kind="line"
          allowCumulative={false}
          loading={!p.analytics}
        />
        <ChartCard
          title="New and returning traders"
          data={activity}
          series={[
            { key: "new", label: "First recorded fill" },
            { key: "returning", label: "Returning" },
          ]}
          unit="count"
          stack
          note="New means first fill in covered history; accounts, not people."
        />
        <ChartCard
          title="Maker and taker fills"
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
        <p className="chart-note">
          Cohort = first recorded fill week · % active again in week N ·
          incomplete latest recorded week marked * · all markets · full recorded
          history.
        </p>
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
        Registration-to-first-trade conversion is unavailable without complete
        historical account creation mapping.
      </p>
    </>
  );
}
