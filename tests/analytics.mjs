import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { PostgresStore } from "../cloud/postgres-store.mjs";
import { analyticsView, recordMarkets } from "../cloud/analytics.mjs";
const pg = new PGlite(),
  pool = {
    query: async (s, a) =>
      !a && s.split(";").filter((x) => x.trim()).length > 1
        ? (await pg.exec(s)).at(-1)
        : pg.query(s, a),
    connect: async () => ({ ...pool, release() {} }),
    end: () => pg.close(),
  },
  store = new PostgresStore(pool);
try {
  await store.init();
  await pool.query(
    "INSERT INTO accounts VALUES ('dune','2026-02-02','1',2),('dune','2026-02-02','2',3),('rpc','2026-02-09','1',4),('rpc','2026-02-09','3',5)",
  );
  const a = await analyticsView(store);
  const latest = a.activity.at(-1);
  assert.equal(latest.dau, 2);
  assert.equal(latest.wau, 2);
  assert.equal(latest.mau, 3);
  assert.equal(latest.new, 1);
  assert.equal(latest.returning, 1);
  assert.equal(a.activity[1].dau, 0);
  assert.equal(a.activity[1].wau, 2);
  assert.equal(
    a.cohorts.find((c) => c.cohort === "2026-02-02" && c.age === 1).active,
    1,
  );
  assert.equal(
    a.cohorts.find((c) => c.cohort === "2026-02-02" && c.age === 1).size,
    2,
  );
  await recordMarkets(store, {
    markets: [{ id: 1, state: { oi: 10 }, config: {}, funding: {} }],
  });
  await recordMarkets(store, {
    markets: [{ id: 1, state: { oi: 11 }, config: {}, funding: {} }],
  });
  assert.equal(
    Number(
      (await pool.query("SELECT count(*) n FROM market_history")).rows[0].n,
    ),
    1,
  );
  store.storageRoom = async () => false;
  await recordMarkets(store, { markets: [{ id: 2, state: {} }] });
  assert.equal(
    Number(
      (await pool.query("SELECT count(*) n FROM market_history")).rows[0].n,
    ),
    1,
  );
  console.log(
    "PASS: distinct rolling activity, new/returning accounts, cohort retention, hourly upsert and storage guard.",
  );
} finally {
  await pg.close();
}
