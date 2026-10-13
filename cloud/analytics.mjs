// Compact queries run once per refresh window, not once per chart or visitor.
export async function analyticsView(store) {
  const key = "analytics:v1",
    saved = await store.cache(key);
  if (saved && Date.now() - saved.at < 300000) return saved.data;
  const result = await store.transaction(
    async (db) => {
      const activity = (
        await db.query(`WITH a AS (SELECT day::date AS day,account,SUM(fills) fills FROM accounts GROUP BY day,account),
   firsts AS (SELECT account,min(day) first_day FROM a GROUP BY account),
   days AS (SELECT DISTINCT day FROM a),
   rolls AS (SELECT d.day,COUNT(DISTINCT a.account) mau,COUNT(DISTINCT a.account) FILTER (WHERE a.day>d.day-7) wau,COUNT(DISTINCT a.account) FILTER (WHERE a.day=d.day) dau FROM days d JOIN a ON a.day BETWEEN d.day-29 AND d.day GROUP BY d.day),
   daily AS (SELECT a.day,SUM(a.fills) fills,COUNT(*) FILTER (WHERE a.day=f.first_day) new,COUNT(*) FILTER (WHERE a.day>f.first_day) AS "returning" FROM a JOIN firsts f USING(account) GROUP BY a.day)
   SELECT (extract(epoch FROM r.day)*1000)::bigint t,r.dau,r.wau,r.mau,d.new,d."returning",d.fills FROM rolls r JOIN daily d USING(day) ORDER BY r.day`)
      ).rows.map((r) =>
        Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Number(v)])),
      );
      const cohorts = (
        await db.query(
          `WITH firsts AS (SELECT account,date_trunc('week',min(day)::date)::date cohort FROM accounts GROUP BY account), sizes AS (SELECT cohort,count(*) size FROM firsts GROUP BY cohort), active AS (SELECT DISTINCT a.account,f.cohort,date_trunc('week',a.day::date)::date week FROM accounts a JOIN firsts f USING(account)) SELECT a.cohort::text,((a.week-a.cohort)/7)::int age,count(*)::int active,s.size::int size FROM active a JOIN sizes s USING(cohort) GROUP BY a.cohort,a.week,s.size ORDER BY a.cohort,a.week`,
        )
      ).rows;
      const stats = (
        await db.query(
          `WITH f AS (SELECT account,SUM(fills) fills FROM accounts GROUP BY account), ranked AS (SELECT fills,row_number() OVER(ORDER BY fills DESC) rank,count(*) OVER() n FROM f) SELECT SUM(fills)::text fills, SUM(fills) FILTER(WHERE rank<=ceil(n*.01))::text top_fills,COUNT(*)::int accounts FROM ranked`,
        )
      ).rows[0];
      const snapshots = (
        await db.query(
          `SELECT DISTINCT ON ((bucket/86400000),market) bucket,market,jsonb_build_object('state',jsonb_build_object('oi',data->'state'->'oi','mrk',data->'state'->'mrk','tvl',data->'state'->'tvl')) data FROM market_history ORDER BY (bucket/86400000),market,bucket DESC`,
        )
      ).rows.map((r) => ({ t: Number(r.bucket), market: r.market, ...r.data }));
      const flows = (
        await db.query(
          "SELECT f.*,a.address FROM recent_flow_details f LEFT JOIN account_addresses a USING(account) ORDER BY f.time DESC LIMIT 100",
        )
      ).rows.map((r) => ({ ...r, time: Number(r.time) }));
      return {
        activity: activity.map((r) => ({
          ...r,
          stickiness: r.mau ? (r.dau / r.mau) * 100 : null,
          fillsPerTrader: r.dau ? r.fills / r.dau : null,
        })),
        cohorts,
        concentration:
          stats.fills > 0
            ? (Number(stats.top_fills) / Number(stats.fills)) * 100
            : null,
        snapshots,
        flows,
        at: Date.now(),
        coverage:
          "Activity since first recorded fill; account counts, not distinct people. Market history and flow details are forward-only.",
      };
    },
    { readOnly: true },
  );
  await store.saveCache(key, result);
  return result;
}
export async function recordMarkets(store, ctx) {
  const bucket = Math.floor(Date.now() / 3600000) * 3600000,
    rows = ctx.markets.map((m) => ({
      market: String(m.id),
      data: { state: m.state, config: m.config, funding: m.funding },
    }));
  await store.transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(143,202603)");
    if (!(await store.storageRoom(db, 1024 * 1024))) return;
    // Maximum 90 days of hourly state, never raw chain blocks. Daily summaries elsewhere remain permanent.
    await db.query("DELETE FROM market_history WHERE bucket<$1", [
      bucket - 90 * 86400000,
    ]);
    for (const r of rows)
      await db.query(
        "INSERT INTO market_history VALUES($1,$2,$3) ON CONFLICT(bucket,market) DO UPDATE SET data=excluded.data",
        [bucket, r.market, JSON.stringify(r.data)],
      );
  });
}
