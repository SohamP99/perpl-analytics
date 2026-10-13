import assert from 'node:assert/strict';
import {bucketVolume,HISTORY_START} from '../lib/history.ts';
const points=['2026-02-01','2026-02-02','2026-02-08','2026-02-09','2026-03-01','2026-03-02'].map((d,i)=>({t:Date.parse(d+'T00:00:00Z'),v:(i+1)*100}));
for(const interval of ['1D','7D','1M']){const rows=bucketVolume(points,interval);assert.equal(rows.reduce((s,r)=>s+r.v,0),2100);assert.ok(rows.every(r=>r.t>=HISTORY_START));}
assert.equal(bucketVolume(points,'1D').length,6);
assert.deepEqual(bucketVolume(points,'1M').map(r=>r.v),[1000,1100]);
assert.deepEqual(bucketVolume(points,'7D').map(r=>new Date(r.t).toISOString().slice(0,10)),['2026-02-01','2026-02-02','2026-02-09','2026-02-23','2026-03-02']);
assert.deepEqual(bucketVolume([...points,{t:HISTORY_START-1,v:999}],'1M'),bucketVolume(points,'1M'));
console.log('PASS: UTC daily/weekly/monthly volume aggregation conserves volume and never starts before February.');
