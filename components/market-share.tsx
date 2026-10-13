import { useMemo, useState } from "react";
import { Raw, money } from "@/lib/perpl";
import { marketColor } from "@/lib/analytics";
import { shareTiles } from "@/lib/dashboard-math";
export default function MarketShare({
  markets,
  metric,
  openMarket,
}: {
  markets: Raw[];
  metric: string;
  openMarket: (id: string) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const tiles = useMemo(
    () =>
      shareTiles(
        markets.map((m) => ({ id: String(m.id), value: Number(m[metric]) })),
      ),
    [markets, metric],
  );
  const total = tiles.reduce((n, t) => n + t.value, 0),
    selected = tiles.find((t) => t.id === hover);
  return (
    <div
      className="market-treemap"
      onMouseLeave={() => setHover(null)}
      aria-label="Market share by proportional area"
    >
      {tiles.map((t) => {
        const m = markets.find((m) => String(m.id) === t.id)!;
        const label =
          m.symbol +
          ": " +
          ((t.value / total) * 100).toFixed(2) +
          "% · " +
          money(t.value);
        return (
          <button
            key={t.id}
            aria-label={label}
            onFocus={() => setHover(t.id)}
            onBlur={() => setHover(null)}
            onMouseEnter={() => setHover(t.id)}
            onClick={() => openMarket(t.id)}
            style={{
              left: t.x / 10 + "%",
              top: t.y / 6 + "%",
              width: t.width / 10 + "%",
              height: t.height / 6 + "%",
              background: marketColor(t.id),
            }}
          >
            {t.value / total >= 0.05 && t.width > 150 && t.height > 135 && (
              <>
                <b>{m.symbol}</b>
                <strong>{((t.value / total) * 100).toFixed(1)}%</strong>
                {t.width > 170 && t.height > 140 && (
                  <span>{money(t.value)}</span>
                )}
              </>
            )}
          </button>
        );
      })}
      {selected && (
        <div className="treemap-tooltip" role="status">
          <b>{markets.find((m) => String(m.id) === selected.id)?.symbol}</b>
          <span>
            {((selected.value / total) * 100).toFixed(2)}% ·{" "}
            {money(selected.value)}
          </span>
        </div>
      )}
      {!tiles.length && (
        <div className="chart-empty">Market share unavailable</div>
      )}
    </div>
  );
}
