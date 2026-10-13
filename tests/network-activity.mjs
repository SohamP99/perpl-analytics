import assert from 'node:assert/strict';
import {readNetworkSnapshot,applyNetworkCsv} from '../indexer/network-snapshot.mjs';
const data=readNetworkSnapshot('.sites-runtime/no-override');
assert.equal(data.tps.value,36.1);assert.equal(data.tps.executionAt,null);
assert.equal(data.hourly.data.length,24);assert.equal(data.hourly.to-data.hourly.from,86400000);
assert.equal(data.hourly.data.reduce((s,r)=>s+r.transactions,0),3118957);
assert.equal(data.emissions.data.length,254);assert.equal(data.emissions.data[0].t,Date.UTC(2026,1,1));assert.equal(data.emissions.data.at(-1).t,Date.UTC(2026,9,12));
for(const [i,r] of data.emissions.data.entries()){if(i)assert.equal(r.t-data.emissions.data[i-1].t,86400000);assert.ok(Math.abs(r.net+r.burned-r.gross)<1e-5);assert.ok(Math.abs(r.perpl+r.rest-r.burned)<1e-5);}
assert.throws(()=>applyNetworkCsv(data,'avg_tps_24h\nNaN'),/invalid/);
assert.throws(()=>applyNetworkCsv(data,'hour,transactions\n2026-10-13 00:00:00,0\n2026-10-13 00:00:00,0'),/Duplicate/);
assert.throws(()=>applyNetworkCsv(data,'hour,transactions\n2026-10-13 00:00:00,0'),/24 complete/);
assert.throws(()=>applyNetworkCsv(data,'day,gross_emissions_mon,total_burned_mon,perpl_burned_mon,net_emissions_mon,rest_of_monad_burned_mon\n2026-10-12,10,4,3,9,1'),/reconcile/);
const updated=applyNetworkCsv(data,'avg_tps_24h\n0');assert.equal(updated.tps.value,0);assert.deepEqual(updated.emissions,data.emissions);assert.equal(data.tps.value,36.1);
console.log('PASS: actual Dune snapshot totals, UTC coverage, conservation of MON, invalid imports rejected, independent datasets preserved, zero vs missing.');
