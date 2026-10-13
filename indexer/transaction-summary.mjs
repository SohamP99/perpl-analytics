// Batches contain complete, non-overlapping blocks. A transaction cannot span
// two committed batches, so hashes need only live in this in-memory set.
export function tradingTransactionCounts(rows) {
  const seen = new Set(), days = new Map();
  for (const r of rows) {
    if (!r.name.includes("OrderFilled")) continue;
    if (!/^0x[0-9a-f]{64}$/i.test(r.tx)) throw Error("Fill missing transaction hash");
    const tx = r.tx.toLowerCase();
    if (seen.has(tx)) continue;
    seen.add(tx);
    const day = new Date(r.time).toISOString().slice(0, 10);
    days.set(day, (days.get(day) || 0) + 1);
  }
  return [...days].map(([day,count])=>({day,count}));
}
