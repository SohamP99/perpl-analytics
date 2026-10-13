import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {planRanges,orderedRanges} from '../indexer/parallel.mjs';
import {Indexer} from '../indexer/service.mjs';
import {DEPLOYMENT_BLOCK,hex} from '../indexer/chain.mjs';
const start=DEPLOYMENT_BLOCK,hash='0x'+'a'.repeat(64),time=1770937347000;
const ranges=planRanges(start,start+10499);
assert.deepEqual(ranges.map(r=>[r.start-start,r.end-start,r.source]),[[0,4999,'HyperSync'],[5000,9999,'HyperSync'],[10000,10499,'RPC']]);
assert.equal(planRanges(start,start+3).length,1);
const completed=[];
const results=await orderedRanges(ranges,async(r)=>{await new Promise(resolve=>setTimeout(resolve,r.source==='RPC'?1:r.start===start?30:10));completed.push(r.start);if(r.start===start+5000)throw Error('temporary failure');return r;});
assert.equal(completed[0],start+10000);assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'rejected');assert.equal(results[2].status,'fulfilled');
const dir=mkdtempSync(path.join(tmpdir(),'perpl-parallel-test-'));let indexer;
const event=(block,id,amount,account='7')=>({id,block,hash,tx:hash,logIndex:0,time,name:'CollateralDeposit',account,market:'',args:{amountCNS:String(amount)}});
const batch=(a,b,rows=[])=>({start:a,end:b,hash,time,firstParentHash:hash,rows});
try{
 const rpc={url:'https://rpc2.monad.xyz',call:async()=>hex(143),block:async(n)=>({number:hex(typeof n==='number'?n:start+20000),timestamp:hex(time/1000),hash,parentHash:hash})};
 indexer=new Indexer({dataDir:dir,rpc,hypersync:{page:async()=>{throw Error('Unexpected sequential fetch');}}});
 indexer.parallel={workers:3,fetch:async()=>[
   {status:'fulfilled',value:batch(start,start+9,[event(start,'one',1000000)])},
   {status:'rejected',reason:Error('temporary failure')},
   {status:'fulfilled',value:batch(start+20,start+29,[event(start+20,'three',3000000)])}
 ]};
 await indexer.tick();clearTimeout(indexer.timer);
 assert.equal(indexer.store.get('next'),start+10);assert.equal(indexer.store.history('7').rows.length,1);assert.match(indexer.store.get('error'),/temporary/);
 assert.equal(indexer.store.protocol().deposits,1);
 indexer.parallel.fetch=async()=>[{status:'fulfilled',value:batch(start+10,start+29,[event(start+10,'two',2000000),event(start+20,'three',3000000)])}];
 await indexer.tick();clearTimeout(indexer.timer);assert.equal(indexer.store.get('next'),start+30);assert.equal(indexer.store.protocol().deposits,6);assert.equal(indexer.store.protocol().deposits,6);
 // Roll back and replace a batch at the same height; cached totals must rebuild.
 indexer.store.rollback(indexer.store.lastBatch());indexer.store.commit(start+10,start+29,hash,time,[event(start+10,'replacement',7000000)]);
 assert.equal(indexer.store.protocol().deposits,8);assert.equal(indexer.store.history('7').rows.length,2);
 // Stale results must never advance over a noncontiguous checkpoint.
 assert.throws(()=>indexer.store.commit(start+40,start+49,hash,time,[]),/Noncontiguous/);
 // Parent mismatch retains the checkpoint and reports the error.
 indexer.parallel.fetch=async()=>[{status:'fulfilled',value:{...batch(start+30,start+39),firstParentHash:'wrong'}}];
 await indexer.tick();clearTimeout(indexer.timer);assert.equal(indexer.store.get('next'),start+30);assert.match(indexer.store.get('error'),/parent mismatch/);
 console.log('PASS: nonoverlapping parallel ranges, out-of-order completion, failure gap retention, prefix commit, resume, incremental totals, rollback invalidation and parent mismatch.');
}finally{if(indexer){indexer.stop();indexer.store.close();}assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));rmSync(dir,{recursive:true,force:true});}
