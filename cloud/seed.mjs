import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { boundary, summaryNames } from "../indexer/summary-spec.mjs";
export const seedTables = {
  daily: "source text,day text,event text,count bigint,amounts jsonb",
  accounts: "source text,day text,account text,fills bigint",
  liquidation_details:
    "id text,block bigint,time bigint,tx text,account text,market text,args jsonb",
  account_addresses: "account text,address text",
  recent_flows: "minute bigint,deposits numeric,withdrawals numeric",
  recent_accounts: "minute bigint,account text",
  recent_trading_transactions: "tx text,time bigint",
};
export const seedSettings = [
  "next",
  "hash",
  "throughTime",
  "imported",
  "activityImported",
  "recentFrom",
  "recentNext",
];
export function decodeSeed(bytes, expectedHash) {
  if (createHash("sha256").update(bytes).digest("hex") !== expectedHash)
    throw Error("Seed checksum mismatch");
  const seed = JSON.parse(
    gunzipSync(bytes, { maxOutputLength: 40 * 1024 * 1024 }),
  );
  if (
    seed.version !== 1 ||
    JSON.stringify(seed.boundary) !== JSON.stringify(boundary) ||
    !seed.settings.imported ||
    !seed.settings.activityImported
  )
    throw Error("Historical seed is incomplete or has the wrong boundary");
  if (
    !Number.isSafeInteger(seed.settings.next) ||
    seed.settings.next < boundary.toBlockExclusive ||
    !/^0x[0-9a-f]{64}$/i.test(seed.settings.hash)
  )
    throw Error("Invalid seed checkpoint");
  for (const key of Object.keys(seed.settings))
    if (!seedSettings.includes(key) && !/^market-metadata:\d+$/.test(key))
      throw Error("Unexpected seed setting");
  if (
    Object.keys(seed.tables).sort().join() !==
    Object.keys(seedTables).sort().join()
  )
    throw Error("Unexpected seed tables");
  const dailyFills = new Map(),
    accountFills = new Map();
  for (const r of seed.tables.daily) {
    if (
      !["dune", "rpc"].includes(r.source) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(r.day) ||
      r.day < "2026-02-01" ||
      !summaryNames.includes(r.event) ||
      !Number.isSafeInteger(r.count) ||
      r.count < 1 ||
      !Array.isArray(r.amounts) ||
      r.amounts.length !== 5 ||
      r.amounts.some((v) => !/^\d+$/.test(v))
    )
      throw Error("Invalid seed daily row");
    if (
      (r.source === "dune" && r.day >= boundary.cutoff.slice(0, 10)) ||
      (r.source === "rpc" && r.day < boundary.cutoff.slice(0, 10))
    )
      throw Error("Overlapping historical sources");
    if (r.event.includes("OrderFilled"))
      dailyFills.set(
        r.source + ":" + r.day,
        (dailyFills.get(r.source + ":" + r.day) || 0) + r.count,
      );
  }
  for (const r of seed.tables.accounts) {
    if (
      !/^\d+$/.test(r.account) ||
      !Number.isSafeInteger(r.fills) ||
      r.fills < 1
    )
      throw Error("Invalid seed account row");
    const k = r.source + ":" + r.day;
    accountFills.set(k, (accountFills.get(k) || 0) + r.fills);
  }
  if (
    dailyFills.size !== accountFills.size ||
    [...dailyFills].some(([k, v]) => accountFills.get(k) !== v)
  )
    throw Error("Seed account activity does not match fill totals");
  return seed;
}
export async function importSeed(store, seed, checksum) {
  return store.transaction(async (db) => {
    await db.query("SELECT value FROM settings WHERE key='next' FOR UPDATE");
    if (await store.get("cloudSeed", null, db)) return false;
    if (
      (await store.get("imported", null, db)) ||
      (await db.query("SELECT 1 FROM daily LIMIT 1")).rows.length
    )
      throw Error("Refusing to replace an existing cloud history");
    for (const [table, columns] of Object.entries(seedTables)) {
      const names = columns
        .split(",")
        .map((c) => c.trim().split(" ")[0])
        .join(",");
      const rows = seed.tables[table];
      for (let i = 0; i < rows.length; i += 2000)
        await db.query(
          `INSERT INTO ${table} (${names}) SELECT ${names} FROM jsonb_to_recordset($1::jsonb) AS r(${columns})`,
          [JSON.stringify(rows.slice(i, i + 2000))],
        );
    }
    for (const [key, value] of Object.entries(seed.settings))
      await store.set(key, value, db);
    await store.set(
      "cloudSeed",
      { checksum, at: Date.now(), next: seed.settings.next },
      db,
    );
    return true;
  });
}
