import { Raw } from "@/lib/perpl";
export function MarketFilter({
  title,
  markets,
  value,
  onChange,
}: {
  title: string;
  markets: Raw[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      className="chart-market"
      aria-label={title + " market"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="all">All markets</option>
      {markets.map((m) => (
        <option key={m.id} value={m.id}>
          {m.symbol}
        </option>
      ))}
    </select>
  );
}
