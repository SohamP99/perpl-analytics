// Binary treemap: every rectangle has area proportional to its positive value.
export function shareTiles(
  items: { id: string; value: number }[],
  width = 1000,
  height = 600,
) {
  const result: {
    id: string;
    value: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }[] = [];
  const split = (
    rows: typeof items,
    x: number,
    y: number,
    w: number,
    h: number,
  ) => {
    if (!rows.length) return;
    if (rows.length === 1) {
      result.push({ ...rows[0], x, y, width: w, height: h });
      return;
    }
    const total = rows.reduce((n, r) => n + r.value, 0);
    let index = 1,
      sum = rows[0].value;
    while (
      index < rows.length - 1 &&
      Math.abs(total / 2 - (sum + rows[index].value)) <
        Math.abs(total / 2 - sum)
    )
      sum += rows[index++].value;
    const ratio = sum / total;
    if (w >= h) {
      split(rows.slice(0, index), x, y, w * ratio, h);
      split(rows.slice(index), x + w * ratio, y, w * (1 - ratio), h);
    } else {
      split(rows.slice(0, index), x, y, w, h * ratio);
      split(rows.slice(index), x, y + h * ratio, w, h * (1 - ratio));
    }
  };
  split(
    items
      .filter((r) => Number.isFinite(r.value) && r.value > 0)
      .sort((a, b) => b.value - a.value),
    0,
    0,
    width,
    height,
  );
  return result;
}
export function traderGroups(rows: Record<string, any>[]) {
  const groups = [
    {
      name: "Profitable",
      wallets: 0,
      volume: 0,
      pnl: 0,
      color: "var(--green)",
    },
    { name: "Losing", wallets: 0, volume: 0, pnl: 0, color: "var(--red)" },
    {
      name: "Break-even",
      wallets: 0,
      volume: 0,
      pnl: 0,
      color: "var(--muted)",
    },
  ];
  for (const r of rows) {
    if (r.p == null || !Number.isFinite(Number(r.p))) continue;
    const p = Number(r.p),
      g = groups[p > 0 ? 0 : p < 0 ? 1 : 2];
    g.wallets++;
    g.pnl += p / 1e6;
    if (Number.isFinite(Number(r.v)) && Number(r.v) > 0)
      g.volume += Number(r.v) / 1e6;
  }
  return groups;
}
