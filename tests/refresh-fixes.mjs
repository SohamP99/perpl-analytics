import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {SummaryStore} from '../indexer/summary-store.mjs';
import {SummaryEngine} from '../indexer/summary-engine.mjs';
import {boundary,REFRESH_MS} from '../indexer/summary-spec.mjs';
import {hyperSyncRetryMs} from '../indexer/hypersync.mjs';
import {leaderboardWallet} from '../indexer/leaderboard.mjs';
import {positionSize} from '../lib/perpl.ts';
const dir=mkdtempSync(path.join(tmpdir(),'perpl-refresh-')),store=new SummaryStore(path.join(dir,'summaries.sqlite'));
let engine;
try{
 assert.equal(REFRESH_MS,300000);assert.equal(positionSize({size:.00021}), '0.00021');assert.equal(positionSize({sizeLots:'21',sizeDecimals:5}), '0.00021');assert.equal(positionSize({sizeLots:'1000000',sizeDecimals:5}), '10');
 const address='0xd14fb3f7411d2a5672ee2f66ba4b08c45850bba8';
 const snapshot={at:123,stale:false,data:{at:{t:123},d:[{a:address,p:'-199529180',v:'649660903913',r:-8816,i:697}]}};
 const lb=leaderboardWallet(snapshot,address.toUpperCase());assert.equal(lb.pnl,-199.52918);assert.equal(lb.volume,649660.903913);assert.equal(lb.roi,-88.16);assert.equal(leaderboardWallet(snapshot,'0x'+'0'.repeat(40)).found,false);
 assert.equal(hyperSyncRetryMs(new Headers({'retry-after':'20'})),20000);
 const now=1700000000000;assert.equal(hyperSyncRetryMs(new Headers({'retry-after':new Date(now+30000).toUTCString()}),now),30000);assert.equal(hyperSyncRetryMs(new Headers({'x-ratelimit-reset':String(now/1000+90)}),now),90000);
 engine=new SummaryEngine(store,{rpc:{block:async n=>n===undefined?{number:'0x'+(boundary.toBlockExclusive+64).toString(16)}:{hash:boundary.parentHash}}});
 engine.publicRead=async()=>({stale:false});engine.reader={range:async()=>{const e=Error('Provider cooldown');e.retryMs=20000;throw e;}};
 const started=Date.now();await engine.cycle();clearTimeout(engine.timer);assert.ok(store.get('nextRun')>=started+20000&&store.get('nextRun')<started+25000,'Retry must be scheduled after cooldown, not normal refresh');assert.equal(store.get('retryAt'),store.get('nextRun'));assert.equal(store.get('next'),boundary.toBlockExclusive);
 engine.reader={range:async({start,end})=>({start,end,hash:boundary.firstHash,firstParentHash:boundary.parentHash,time:Date.parse(boundary.cutoff),rows:[]})};
 await engine.cycle();clearTimeout(engine.timer);assert.equal(store.get('retryAt'),null);assert.equal(store.get('error'),'');assert.equal(store.get('next'),boundary.toBlockExclusive+1);assert.ok(store.get('nextRun')>Date.now()+295000);
 store.set('nextRun',Date.now()+14400000);store.set('lastRun',Date.now()-600000);engine.start();clearTimeout(engine.timer);assert.ok(store.get('nextRun')<=Date.now(),'Old four-hour schedule must migrate immediately when overdue');
 store.set('retryAt',Date.now()+400000);engine.start();clearTimeout(engine.timer);assert.equal(store.get('nextRun'),store.get('retryAt'),'Restart must retain provider cooldown');
 console.log('PASS: exact tiny position sizes, official leaderboard units, five-minute schedule, 20-second retry, restart migration, cooldown retention, checkpoint continuity.');
}finally{engine?.stop();store.close();assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));rmSync(dir,{recursive:true});}
