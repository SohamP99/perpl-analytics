import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {SummaryStore} from '../indexer/summary-store.mjs';
import {SummaryEngine} from '../indexer/summary-engine.mjs';
import {boundary} from '../indexer/summary-spec.mjs';
const dir=mkdtempSync(path.join(tmpdir(),'perpl-finishing-'));const s=new SummaryStore(path.join(dir,'summaries.sqlite'));let engine;
try{
 const row={id:'tx:1',block:boundary.toBlockExclusive,time:Date.parse(boundary.cutoff)+1000,tx:'tx',name:'PositionLiquidated',account:'12',market:'31',args:{liqPricePNS:'100',liqLotLNS:'20',positionType:'0'}};
 const account={...row,id:'tx:0',name:'AccountCreated',args:{id:'12',account:'0x'+'a'.repeat(40)}};
 const batch={start:row.block,end:row.block,hash:boundary.firstHash,firstParentHash:boundary.parentHash,time:row.time,rows:[account,row]};
 s.commit(batch);assert.equal(s.liquidations().length,1);assert.equal(s.liquidations()[0].address,account.args.account);assert.equal(s.view().daily[0].liquidations,1);assert.equal(s.view().daily[0].newUsers,1);
 assert.throws(()=>s.commit(batch),/continuity/);assert.equal(s.liquidations().length,1);s.saveDetails([row]);assert.equal(s.liquidations().length,1,'Old-log migration is idempotent');
 assert.throws(()=>s.commit({...batch,start:row.block+1,end:row.block+1,firstParentHash:boundary.firstHash,rows:[row]}),/outside/);assert.equal(s.get('next'),row.block+1);
 const context={tokens:[{id:1,decimals:6}],instances:[{id:1,collateral_token_id:1}],markets:[{id:31,instance_id:1,config:{price_decimals:2,size_decimals:5},state:{oi:'100000',mrk:'8000000',tvl:'12000000'},funding:{rate:-40}}]};
 s.saveCache('/v1/pub/context',context);const point=s.observations().at(-1);assert.equal(point.oi,80000);assert.equal(point.tvl,12);assert.equal(point.m31,-.004);assert.ok(!('context' in point));
 engine=new SummaryEngine(s);engine.cycling=true;let calls=0;engine.publicRead=async()=>{calls++;return {stale:false}};await engine.refreshSnapshots();assert.equal(calls,1,'Public refresh must run during chain catch-up');assert.ok(engine.snapshotTimer);engine.stop();
 console.log('PASS: liquidation persistence and address mapping, replay protection, rejection without checkpoint loss, daily user/liquidation totals, market units, independent snapshot scheduler.');
}finally{engine?.stop();s.close();assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));rmSync(dir,{recursive:true,force:true});}
