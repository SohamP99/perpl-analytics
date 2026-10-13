import assert from "node:assert/strict";
import { build } from "esbuild";
import path from "node:path";
const result = await build({
  stdin: {
    contents: `
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import Overview from './components/tabs/overview';
import Fees from './components/tabs/fees';
import Flows from './components/tabs/flows';
import Growth from './components/tabs/growth';
import Liquidations from './components/liquidations';
import {AnalyticsContext} from './components/analytics-context';
import {annualRate, fundingInterval} from './lib/analytics';
import {shareTiles,traderGroups} from './lib/dashboard-math';
export {annualRate,fundingInterval,shareTiles,traderGroups};
const end=Date.UTC(2026,9,13,12), day=86400000;
const daily=Array.from({length:60},(_,i)=>({t:end-(59-i)*day,v:10,deposits:20,withdrawals:10,fees:4,builderFees:1,protocolFees:1,insuranceFees:1,newUsers:2,liquidations:1,makerFees:2,takerFees:2,depositCount:2,withdrawalCount:1}));
const props={protocol:{daily,deposits:1200,withdrawals:600,fees:240,positionProtocolFees:60,insuranceFees:60,newAccounts:120,liquidations:60,activity24h:{mode:'rolling',activeUsers:7,deposits:50,withdrawals:30},coverage:{historicalImported:true}},markets:[{id:1,symbol:'BTC',oi:500,volume:1000}],chartMarkets:[],volumeDaily:daily.map(d=>({...d,v:100})),analytics:{activity:[],flows:[]},loading:false,chartError:'',openMarket:()=>{}};
export function render(name,range){return renderToStaticMarkup(<AnalyticsContext.Provider value={{range,end,market:'all',markets:[],openMarket:()=>{}}}>{React.createElement({Overview,Fees,Flows,Growth,Liquidations}[name],props)}</AnalyticsContext.Provider>)}
`,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  platform: "node",
  format: "cjs",
  write: false,
  alias: { "@": process.cwd() },
  logLevel: "silent",
});
// The bundle is self-contained; use a local CommonJS loader without writing artifacts.
const { createRequire } = await import("node:module");
const mod = { exports: {} };
new Function("require", "module", "exports", result.outputFiles[0].text)(
  createRequire(import.meta.url),
  mod,
  mod.exports,
);
const { render, annualRate, fundingInterval, shareTiles, traderGroups } =
  mod.exports;
const metrics = (html) =>
  [...html.matchAll(/<div class="metric">(.*?)<\/strong><\/div>/g)].map(
    (m) => m[1],
  );
for (const name of ["Overview", "Fees", "Flows", "Growth", "Liquidations"]) {
  const all = render(name, "All"),
    week = render(name, "7D");
  assert.deepEqual(
    metrics(all),
    metrics(week),
    name + " counters must not change with chart range",
  );
  assert.ok(metrics(all).length > 0);
  assert.equal(all.includes('class="sparkline"'), false);
  assert.equal(all.includes('class="metric-note"'), false);
  assert.equal(
    all.includes('aria-checked="true"'),
    false,
    "cumulative starts off",
  );
}
assert.match(render("Overview", "7D"), /7 daily observations/);
assert.match(render("Overview", "All"), /60 daily observations/);
assert.equal(
  render("Growth", "All").includes('role="switch"'),
  false,
  "activity cannot sum repeated users",
);
assert.equal(
  render("Liquidations", "All").includes('aria-label="Liquidation market"'),
  false,
);
assert.equal(fundingInterval({ funding_interval_sec: 2580, config: {} }), 2580);
assert.equal(fundingInterval({ config: { funding_interval_sec: 3600 } }), 3600);
assert.equal(
  annualRate({ rate: 0.004, funding_interval_sec: 2580, config: {} }),
  (0.004 * 365 * 86400) / 2580,
);
const tiles = shareTiles(
  [
    { id: "BTC", value: 900 },
    { id: "ETH", value: 90 },
    { id: "VVV", value: 10 },
  ],
  1000,
  600,
);
for (const tile of tiles)
  assert.ok(
    Math.abs((tile.width * tile.height) / 600000 - tile.value / 1000) < 1e-10,
  );
assert.ok(
  tiles.every(
    (t) =>
      t.x >= 0 &&
      t.y >= 0 &&
      t.x + t.width <= 1000.00001 &&
      t.y + t.height <= 600.00001,
  ),
);
const groups = traderGroups([
  { p: 1000000, v: 20000000 },
  { p: -1000000, v: 10000000 },
  { p: 0, v: 5000000 },
  { p: null, v: 10 },
]);
assert.deepEqual(
  groups.map((g) => g.wallets),
  [1, 1, 1],
);
assert.deepEqual(
  groups.map((g) => g.volume),
  [20, 10, 5],
);
console.log(
  "PASS: fixed counters, chart range isolation, cumulative defaults, funding scaling, proportional areas and wallet grouping",
);
