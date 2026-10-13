import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {SummaryStore} from '../indexer/summary-store.mjs';
import {SummaryEngine} from '../indexer/summary-engine.mjs';
const dir=mkdtempSync(path.join(tmpdir(),'perpl-metrics-')),s=new SummaryStore(path.join(dir,'test.sqlite'));
try{
 const base=Date.UTC(2026,9,13),fill=(time,tx,account)=>({time,tx,account,name:'MakerOrderFilled',args:{}}),flow=(time,name,amount)=>({time,name,args:{amountCNS:amount}});
 s.saveRecent([fill(base+1,'a','1'),fill(base+2,'a','2'),fill(base+59000,'b','1'),flow(base+1000,'CollateralDeposit','9000000'),flow(base+60000,'CollateralWithdrawal','2000000')],base,base+120000,1,2);
 s.set('throughTime',base+86400000);s.saveRecent([fill(base+86400000,'c','3')],base+120000,base+86400000,3,4);s.set('next',5);
 let r=s.activity24h([]);assert.equal(r.activeUsers,2);assert.equal(r.tps,2/86400);assert.equal(r.deposits,9);assert.equal(r.withdrawals,2);
 s.set('throughTime',base+86460000);r=s.activity24h([]);assert.equal(r.activeUsers,1);assert.equal(r.deposits,0);assert.equal(r.withdrawals,2);assert.equal(r.tps,1/86400);
 s.set('next',6);assert.equal(s.activity24h([]),null,'An old writer cannot silently advance rolling coverage');s.set('next',5);
 // An old writer or missing contiguous batch invalidates rolling coverage, without altering history.
 s.saveRecent([],base+86460000,base+86520000,8,9);assert.equal(s.activity24h([]),null);
 s.db.prepare('INSERT INTO liquidation_details VALUES(?,?,?,?,?,?,?)').run('x',1,base,'x','1','30','{}');
 s.saveCache('/v1/pub/context',{markets:[{id:1}]});let calls=0;const engine=new SummaryEngine(s,{rpc:{read:async()=>{calls++;return [{symbol:'SOL',priceDecimals:2n,lotDecimals:3n}]}}});
 assert.deepEqual(await engine.liquidationMarkets(),[{id:30,symbol:'SOL (retired)',priceScale:100,sizeScale:1000}]);await engine.liquidationMarkets();assert.equal(calls,1);engine.stop();
 console.log('PASS: rolling minute boundaries, unique trading transactions/accounts, exact flows, continuity reset, retired-market units and cache.');
}finally{s.close();assert.ok(dir.startsWith(path.resolve(tmpdir())+path.sep));rmSync(dir,{recursive:true});}
