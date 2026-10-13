import { money, Raw } from "@/lib/perpl";
import { inRange, total, delta } from "@/lib/analytics";
import { ChartCard } from "../chart-card";
import { Metric } from "../pulse-ui";
import { TabProps, useAnalytics } from "../analytics-context";
export default function Fees(p: TabProps) {
  const { range, end } = useAnalytics(),
    daily = (p.protocol?.daily || []).map((r: Raw, i: number, a: Raw[]) => {
      const volume = p.volumeDaily.find((v) => v.t === r.t)?.v,
        fees = r.fees + r.protocolFees + r.insuranceFees,
        prior = a.slice(Math.max(0, i - 29), i + 1);
      return {
        ...r,
        netTradingFees: r.fees - r.builderFees,
        allFees: fees,
        effective:
          volume > 0 && !p.chartError ? (r.fees / volume) * 10000 : null,
        runRate:
          prior.length === 30
            ? (prior.reduce(
                (s, d) => s + d.fees + d.protocolFees + d.insuranceFees,
                0,
              ) *
                365) /
              30
            : null,
      };
    }),
    rows = daily;
  return (
    <>
      <div className="metric-grid">
        {[
          ["allFees", "Fees collected"],
          ["fees", "Trading fees"],
          ["builderFees", "Builder fees"],
          ["protocolFees", "Protocol position fees"],
        ].map(([key, label]) => (
          <Metric
            key={key}
            title={label + " (all time)"}
            value={money(total(rows, key))}
            change={delta(daily, key, range, end)}
            note={`${range} · all markets`}
          />
        ))}
      </div>
      <div className="secondary-grid">
        <ChartCard
          title="Fee components"
          data={daily}
          series={[
            { key: "netTradingFees", label: "Trading excluding builder" },
            { key: "builderFees", label: "Builder" },
            { key: "protocolFees", label: "Protocol" },
            { key: "insuranceFees", label: "Insurance" },
          ]}
          stack
        />
        <ChartCard
          title="Maker and taker fees"
          data={daily}
          series={[
            { key: "makerFees", label: "Maker" },
            { key: "takerFees", label: "Taker" },
          ]}
          stack
        />
        <ChartCard
          title="Effective trading fee rate"
          data={daily}
          series={[
            { key: "effective", label: "Effective rate", aggregation: "mean" },
          ]}
          unit="bps"
          kind="line"
          allowCumulative={false}
          note="Trading fees / candle volume; unavailable when candle coverage is partial"
        />
        <ChartCard
          title="Annualised fee run-rate"
          data={daily}
          series={[{ key: "runRate", label: "Run-rate", aggregation: "last" }]}
          kind="line"
          allowCumulative={false}
          note="Trailing 30 UTC days × 365/30 · extrapolation, not forecast"
        />
      </div>
    </>
  );
}
