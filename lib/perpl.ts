export type Raw = Record<string, any>;
export const money = (v: number | null | undefined, compact = true) =>
  v == null || !Number.isFinite(v)
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        notation: compact ? "compact" : "standard",
        maximumFractionDigits: 2,
      }).format(v);
export const pct = (v: number | null | undefined, d = 2) =>
  v == null || !Number.isFinite(v)
    ? "—"
    : `${v > 0 ? "+" : ""}${v.toFixed(d)}%`;
export const price = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v)
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: Math.abs(v) < 1 ? 6 : Math.abs(v) < 100 ? 4 : 2,
      }).format(v);
export const short = (s: string) => s.slice(0, 6) + "…" + s.slice(-4);
export function positionSize(p: Raw) {
  if (
    /^\d+$/.test(p.sizeLots) &&
    Number.isInteger(p.sizeDecimals) &&
    p.sizeDecimals >= 0 &&
    p.sizeDecimals <= 30
  ) {
    const digits = p.sizeLots.padStart(p.sizeDecimals + 1, "0");
    return p.sizeDecimals
      ? (
          digits.slice(0, -p.sizeDecimals) +
          "." +
          digits.slice(-p.sizeDecimals)
        ).replace(/\.?0+$/, "")
      : digits;
  }
  if (!Number.isFinite(p.size)) return "—";
  return new Intl.NumberFormat("en-US", {
    maximumSignificantDigits: 15,
  }).format(p.size);
}
export function normalize(m: Raw, ctx: Raw): Raw {
  const token = ctx.tokens.find(
    (t: Raw) =>
      t.id ===
      ctx.instances.find((i: Raw) => i.id === m.instance_id)
        ?.collateral_token_id,
  );
  const scale = 10 ** (token?.decimals ?? 6),
    p = 10 ** m.config.price_decimals,
    s = 10 ** m.config.size_decimals;
  const v = m.state || {};
  return {
    ...m,
    symbol: m.symbol || m.name || m.size_units || String(m.id),
    scale,
    priceScale: p,
    sizeScale: s,
    price: v.mrk == null ? null : v.mrk / p,
    volume: v.dva == null ? null : Number(v.dva) / scale,
    oi: v.oi == null || v.mrk == null ? null : ((v.oi / s) * v.mrk) / p,
    tvl: v.tvl == null ? null : Number(v.tvl) / scale,
    change: v.prv > 0 ? (v.lst / v.prv - 1) * 100 : null,
    rate: m.funding?.rate == null ? null : m.funding.rate / 10000,
    spread: v.mid > 0 ? ((v.ask - v.bid) / v.mid) * 10000 : null,
    basis: v.orl > 0 ? (v.mrk / v.orl - 1) * 100 : null,
  };
}
export async function api(
  path: string,
  headers: Record<string, string> = {},
  signal?: AbortSignal,
): Promise<Raw> {
  const r = await fetch("/api/perpl" + path, {
    headers,
    signal: signal || AbortSignal.timeout(20000),
  });
  const data = (await r.json()) as Raw;
  if (!r.ok) throw new Error(data.error || `API error ${r.status}`);
  return data;
}
