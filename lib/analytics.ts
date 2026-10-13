import { Raw } from "./perpl";
export const DAY = 86400000;
export const START = Date.UTC(2026, 1, 1);
export const RANGES = ["7D", "30D", "90D", "YTD", "All"];
export function rangeStart(range: string, end: number) {
  return range === "All"
    ? START
    : range === "YTD"
      ? Math.max(START, Date.UTC(new Date(end).getUTCFullYear(), 0, 1))
      : Math.max(
          START,
          Math.floor(end / DAY) * DAY -
            (Number(range.replace("D", "")) - 1) * DAY,
        );
}
export function inRange(rows: Raw[], range: string, end: number) {
  return rows.filter((r) => r.t >= rangeStart(range, end) && r.t <= end);
}
export function total(rows: Raw[], key: string) {
  const values = rows.map((r) => r[key]);
  return values.length &&
    values.every((v) => v != null && Number.isFinite(Number(v)))
    ? values.reduce((s, v) => s + Number(v), 0)
    : null;
}
export function delta(rows: Raw[], key: string, range: string, end: number) {
  if (range === "All" || !rows.length) return null;
  const start = rangeStart(range, end),
    length = end - start,
    previous = rows.filter((r) => r.t >= start - length && r.t < start);
  if (!previous.length || Math.min(...rows.map((r) => r.t)) > start - length)
    return null;
  const a = total(inRange(rows, range, end), key),
    b = total(previous, key);
  return a == null || b == null || b === 0
    ? null
    : ((a - b) / Math.abs(b)) * 100;
}
export function marketColor(id: number | string) {
  const ids = [1, 10, 20, 30, 31, 40, 50, 60, 70, 80, 90, 100];
  const i = ids.indexOf(Number(id));
  return `var(--cat-${((i < 0 ? Number(id) || 0 : i) % 8) + 1})`;
}
export function annualRate(m: Raw) {
  const interval = m.config?.funding_interval_sec || m.funding_interval_sec;
  return m.rate != null && interval > 0
    ? (m.rate * 365 * 86400) / interval
    : null;
}
export function csv(name: string, headers: string[], rows: unknown[][]) {
  const escape = (v: unknown) =>
    '"' +
    String(v ?? "")
      .replace(/^[=+@]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  const a = document.createElement("a"),
    url = URL.createObjectURL(
      new Blob(
        [
          headers.map(escape).join(",") +
            "\n" +
            rows.map((r) => r.map(escape).join(",")).join("\n"),
        ],
        { type: "text/csv;charset=utf-8" },
      ),
    );
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
