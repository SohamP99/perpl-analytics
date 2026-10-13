"use client";
import { useId, useMemo, useRef, useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Info, MoreHorizontal } from "lucide-react";
import { Raw, money } from "@/lib/perpl";
import { csv, DAY, rangeStart, total, delta } from "@/lib/analytics";
import { useAnalytics } from "./analytics-context";
export type Series = {
  key: string;
  label: string;
  color?: string;
  aggregation?: "sum" | "mean" | "last";
  kind?: "line" | "bar";
  signed?: boolean;
};
export const count = (v: number) =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(v);
export function ChartTooltip({
  active,
  payload,
  label,
  format,
  series,
  period,
  partial,
}: any) {
  if (!active || !payload?.length) return null;
  const items = payload.filter((p: any) => p.value != null),
    sum = items
      .filter((p: any) => p.dataKey !== "__cumulative")
      .reduce((s: number, p: any) => s + Number(p.value), 0);
  return (
    <div className="unified-tooltip">
      <b>
        {period === "W" ? "Week of " : ""}
        {new Date(Number(label)).toLocaleDateString("en-GB", {
          timeZone: "UTC",
          day: "numeric",
          month: "short",
          year: "numeric",
        })}{" "}
        · UTC
      </b>
      {items.map((p: any) => (
        <div key={p.dataKey}>
          <span>
            <i style={{ background: p.color }} />
            {p.dataKey === "__cumulative"
              ? "Cumulative"
              : series.find((s: Series) => s.key === p.dataKey)?.label}
          </span>
          <strong>
            {format(p.value)}
            {series.length > 1 &&
            sum > 0 &&
            p.dataKey !== "__cumulative" &&
            p.value >= 0
              ? ` · ${((p.value / sum) * 100).toFixed(1)}%`
              : ""}
          </strong>
        </div>
      ))}
      {series.length > 1 && (
        <div>
          <span>Total</span>
          <strong>{format(sum)}</strong>
        </div>
      )}
      {items[0]?.payload?.partial && (
        <small>
          Partial bucket · through{" "}
          {new Date(partial).toLocaleString("en-GB", { timeZone: "UTC" })} UTC
        </small>
      )}
    </div>
  );
}
export function ChartCard({
  title,
  data,
  series,
  unit = "usd",
  kind = "bar",
  stack = false,
  cumulative = false,
  note = "",
  buckets = true,
  loading = false,
  source = "Indexed summaries",
  definition = "",
  filters,
  allowCumulative = true,
  baseline = 0,
  percentStack = false,
}: {
  title: string;
  data: Raw[];
  series: Series[];
  unit?: string;
  kind?: string;
  stack?: boolean;
  cumulative?: boolean;
  note?: string;
  buckets?: boolean;
  loading?: boolean;
  source?: string;
  definition?: string;
  filters?: React.ReactNode;
  allowCumulative?: boolean;
  baseline?: number;
  percentStack?: boolean;
}) {
  const { range, end } = useAnalytics(),
    [period, setPeriod] = useState("D"),
    [hidden, setHidden] = useState<string[]>([]),
    [cum, setCum] = useState(cumulative),
    [mode, setMode] = useState(kind),
    [table, setTable] = useState(false),
    [log, setLog] = useState(false),
    [percent, setPercent] = useState(false),
    [message, setMessage] = useState("");
  const ref = useRef<HTMLElement>(null),
    id = useId().replaceAll(":", ""),
    visible = series.filter((s) => !hidden.includes(s.key));
  const chart = useMemo(() => {
    const map = new Map<number, Raw>();
    for (const row of data) {
      if (row.t < rangeStart(range, end) || row.t > end) continue;
      const date = new Date(row.t);
      date.setUTCHours(0, 0, 0, 0);
      if (period === "W")
        date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
      if (period === "M") date.setUTCDate(1);
      const t = buckets ? date.getTime() : row.t,
        d = map.get(t) || { t, __n: {} };
      for (const s of visible) {
        if (row[s.key] == null || !Number.isFinite(Number(row[s.key])))
          continue;
        d.__n[s.key] = (d.__n[s.key] || 0) + 1;
        d[s.key] =
          s.aggregation === "last"
            ? Number(row[s.key])
            : (d[s.key] || 0) + Number(row[s.key]);
      }
      map.set(t, d);
    }
    let acc = baseline;
    return [...map.values()]
      .sort((a, b) => a.t - b.t)
      .map((d) => {
        for (const s of visible)
          if (s.aggregation === "mean" && d.__n[s.key])
            d[s.key] /= d.__n[s.key];
        const sum = visible.reduce((n, s) => n + (d[s.key] || 0), 0);
        acc += sum;
        d.__cumulative = acc;
        const next = new Date(d.t);
        if (period === "M") next.setUTCMonth(next.getUTCMonth() + 1);
        else next.setUTCDate(next.getUTCDate() + (period === "W" ? 7 : 1));
        d.partial = next.getTime() > end;
        if (percent && sum > 0)
          for (const s of visible)
            if (d[s.key] != null) d[s.key] = (d[s.key] / sum) * 100;
        return d;
      });
  }, [data, range, end, period, hidden, baseline, percent]);
  const format = (v: number) =>
    percent
      ? count(v) + "%"
      : unit === "usd"
        ? money(v)
        : unit === "percent"
          ? count(v) + "%"
          : unit === "bps"
            ? count(v) + " bps"
            : count(v);
  const pointTotal =
    visible.length === 1 && visible[0].aggregation !== "mean"
      ? visible[0].aggregation === "last"
        ? (chart.at(-1)?.[visible[0].key] ?? null)
        : total(chart, visible[0].key)
      : null;
  const change =
    visible.length === 1 && !visible[0].aggregation
      ? delta(data, visible[0].key, range, end)
      : null;
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    logAllowed = chart.every((d) =>
      visible.every((s) => d[s.key] == null || d[s.key] > 0),
    );
  async function png() {
    try {
      const svg = ref.current?.querySelector(".recharts-surface");
      if (!svg) return;
      const clone = svg.cloneNode(true) as SVGElement;
      const originals = [svg, ...svg.querySelectorAll("*")],
        copies = [clone, ...clone.querySelectorAll("*")];
      copies.forEach((el, i) => {
        const style = getComputedStyle(originals[i]);
        for (const k of ["fill", "stroke", "font-family", "font-size", "color"])
          el.setAttribute(k, style.getPropertyValue(k));
      });
      const blob = new Blob([new XMLSerializer().serializeToString(clone)], {
          type: "image/svg+xml",
        }),
        url = URL.createObjectURL(blob),
        img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = svg.clientWidth * 2;
        c.height = svg.clientHeight * 2;
        const g = c.getContext("2d")!;
        g.fillStyle = getComputedStyle(ref.current!).backgroundColor;
        g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        const a = document.createElement("a");
        a.href = c.toDataURL();
        a.download = slug + ".png";
        a.click();
        URL.revokeObjectURL(url);
      };
      img.src = url;
    } catch {
      setMessage("Image export unavailable; use CSV.");
    }
  }
  return (
    <section
      className="panel chart-card"
      ref={ref}
      id={slug}
      aria-label={`${title}. ${chart.length} ${period === "D" ? "daily" : period === "W" ? "weekly" : "monthly"} observations. ${note}`}
    >
      <div className="panel-head">
        <div className="inline">
          <h2>{title}</h2>
          <details className="info-popover">
            <summary aria-label={`About ${title}`}>
              <Info size={15} />
            </summary>
            <div>
              {definition || title + ". " + source + "."}
              <p>
                {note ||
                  "Coverage follows the available source history. Missing values are not zero."}
              </p>
            </div>
          </details>
        </div>
        <div className="inline">
          {buckets && (
            <div className="period-picker">
              {["D", "W", "M"].map((p) => (
                <button
                  key={p}
                  title={
                    {
                      D: "Daily buckets",
                      W: "Weekly buckets",
                      M: "Monthly buckets",
                    }[p]
                  }
                  aria-label={`${title}: ${p}`}
                  aria-pressed={period === p}
                  className={period === p ? "active" : ""}
                  onClick={() => setPeriod(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
          <details className="chart-menu">
            <summary aria-label={`${title} options`}>
              <MoreHorizontal size={18} />
            </summary>
            <div>
              <button
                onClick={() =>
                  csv(
                    slug + ".csv",
                    ["UTC", ...visible.map((s) => s.label), "Cumulative"],
                    chart.map((d) => [
                      new Date(d.t).toISOString(),
                      ...visible.map((s) => d[s.key]),
                      cum ? d.__cumulative : null,
                    ]),
                  )
                }
              >
                Download CSV
              </button>
              <button onClick={png}>Download PNG</button>
              <button onClick={() => setTable(!table)}>
                {table ? "View chart" : "View as table"}
              </button>
              <button disabled={!logAllowed} onClick={() => setLog(!log)}>
                {log ? "Linear scale" : "Log scale"}
              </button>
              <button
                onClick={() =>
                  navigator.clipboard
                    .writeText(location.href.split("#")[0] + "#" + slug)
                    .then(() => setMessage("Chart link copied"))
                    .catch(() => setMessage("Copy unavailable"))
                }
              >
                Copy link to chart
              </button>
            </div>
          </details>
        </div>
      </div>
      {pointTotal != null && (
        <div className="chart-headline">
          {format(pointTotal)}
          {change != null && (
            <small className={change < 0 ? "red" : "green"}>
              {change < 0 ? "▼" : "▲"} {Math.abs(change).toFixed(1)}% vs
              previous period
            </small>
          )}
        </div>
      )}
      <div className="chart-controls">
        <div className="chart-filters">
          {filters || (
            <span className="muted">
              {range} · {source}
            </span>
          )}
        </div>
        <div className="chart-display">
          {percentStack && (
            <button
              className="secondary"
              aria-pressed={percent}
              onClick={() => setPercent(!percent)}
            >
              {percent ? "100%" : "Stacked"}
            </button>
          )}
          <div className="period-picker">
            {["bar", "line"].map((m) => (
              <button
                key={m}
                aria-pressed={mode === m}
                className={mode === m ? "active" : ""}
                onClick={() => setMode(m)}
              >
                {m === "bar" ? "Bars" : "Line"}
              </button>
            ))}
          </div>
          {allowCumulative && unit !== "percent" && unit !== "bps" && (
            <label className="switch-label">
              <button
                role="switch"
                aria-checked={cum}
                aria-label={`${title} cumulative`}
                onClick={() => setCum(!cum)}
              >
                <span />
              </button>
              Cumulative
            </label>
          )}
        </div>
      </div>
      {loading ? (
        <div
          className="skeleton chart-skeleton"
          aria-label={`Loading ${title}`}
        />
      ) : !chart.length ? (
        <div className="chart-empty">No observations in this range. {note}</div>
      ) : table ? (
        <div className="table-wrap chart-table">
          <table>
            <thead>
              <tr>
                <th>UTC</th>
                {visible.map((s) => (
                  <th key={s.key}>{s.label}</th>
                ))}
                {cum && <th>Cumulative</th>}
              </tr>
            </thead>
            <tbody>
              {chart.map((d) => (
                <tr key={d.t}>
                  <td>
                    {new Date(d.t).toISOString().slice(0, 10)}
                    {d.partial ? " *" : ""}
                  </td>
                  {visible.map((s) => (
                    <td key={s.key}>
                      {d[s.key] == null ? "—" : format(d[s.key])}
                    </td>
                  ))}
                  {cum && <td>{format(d.__cumulative)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="analytics-plot">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chart}
              stackOffset="sign"
              margin={{ top: 22, right: 8, bottom: 8, left: 0 }}
            >
              <defs>
                <pattern
                  id={"partial" + id}
                  width="5"
                  height="5"
                  patternUnits="userSpaceOnUse"
                >
                  <rect
                    width="5"
                    height="5"
                    fill="var(--purple)"
                    fillOpacity=".35"
                  />
                  <path d="M0 5L5 0" stroke="var(--muted)" strokeWidth="1" />
                </pattern>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="t"
                tickFormatter={(t) =>
                  new Date(t).toLocaleDateString("en-GB", {
                    timeZone: "UTC",
                    day: "numeric",
                    month: "short",
                  })
                }
                tick={{ fontSize: 12, fill: "var(--muted)" }}
                minTickGap={40}
              />
              <YAxis
                yAxisId="value"
                scale={log && logAllowed ? "log" : "auto"}
                domain={log && logAllowed ? ["auto", "auto"] : undefined}
                tickFormatter={format}
                width={70}
                tick={{ fontSize: 12, fill: "var(--muted)" }}
                label={{
                  value: percent
                    ? "Share %"
                    : unit === "usd"
                      ? "USD"
                      : unit === "percent"
                        ? "Percent"
                        : unit === "bps"
                          ? "Basis points"
                          : "Count",
                  position: "insideTopLeft",
                  dy: -22,
                  fill: "var(--muted)",
                  fontSize: 11,
                }}
              />
              <YAxis
                yAxisId="cum"
                orientation="right"
                hide={!cum || !allowCumulative}
                width={75}
                tickFormatter={format}
                tick={{ fontSize: 12, fill: "var(--muted)" }}
                label={{
                  value: "Cumulative",
                  position: "insideTopRight",
                  dy: -22,
                  fill: "var(--muted)",
                  fontSize: 11,
                }}
              />
              <ReferenceLine yAxisId="value" y={0} stroke="var(--muted)" />
              <Tooltip
                content={
                  <ChartTooltip
                    format={format}
                    series={visible}
                    period={period}
                    partial={end}
                  />
                }
              />
              {visible.map((s, i) =>
                (s.kind || mode) === "line" ? (
                  <Line
                    key={s.key}
                    yAxisId="value"
                    dataKey={s.key}
                    stroke={s.color || `var(--cat-${(i % 8) + 1})`}
                    dot={false}
                    strokeWidth={2}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                ) : (
                  <Bar
                    key={s.key}
                    yAxisId="value"
                    dataKey={s.key}
                    stackId={stack ? "total" : undefined}
                    fill={s.color || `var(--cat-${(i % 8) + 1})`}
                    isAnimationActive={false}
                  >
                    {chart.map((d) => (
                      <Cell
                        key={d.t}
                        fill={
                          d.partial
                            ? "url(#partial" + id + ")"
                            : s.signed
                              ? d[s.key] < 0
                                ? "var(--red)"
                                : "var(--green)"
                              : s.color || `var(--cat-${(i % 8) + 1})`
                        }
                        opacity={d.partial ? 0.5 : 1}
                      />
                    ))}
                  </Bar>
                ),
              )}
              {cum && allowCumulative && (
                <Area
                  yAxisId="cum"
                  dataKey="__cumulative"
                  stroke="var(--cumulative)"
                  fill="var(--cumulative)"
                  fillOpacity={0.06}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="chart-legend">
        {series.map((s, i) => (
          <button
            key={s.key}
            className={hidden.includes(s.key) ? "legend-off" : ""}
            aria-pressed={!hidden.includes(s.key)}
            onClick={() =>
              setHidden((old) =>
                old.includes(s.key)
                  ? old.filter((k) => k !== s.key)
                  : [...old, s.key],
              )
            }
          >
            <i style={{ background: s.color || `var(--cat-${(i % 8) + 1})` }} />
            {s.label}
          </button>
        ))}
        {cum && allowCumulative && <span>─ Cumulative (right axis)</span>}
      </div>
      <div className="chart-note">
        UTC · current bucket partial{note ? " · " + note : ""}
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
