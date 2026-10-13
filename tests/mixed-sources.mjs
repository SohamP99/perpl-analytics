import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Store} from '../indexer/store.mjs';
import {Indexer} from '../indexer/service.mjs';
import {DEPLOYMENT_BLOCK as D,hex} from '../indexer/chain.mjs';
import {findSpectrumStart} from '../indexer/spectrum-retention.mjs';

const hash='0x'+'a'.repeat(64),stamp=1783008000;
const header=n=>({number:hex(n),hash,parentHash:hash,timestamp:hex(stamp)});
const rpc={url:'https://example.invalid',call:async()=>hex(143),block:async(n=D+1000)=>header(n)};
const row=n=>({id:String(n),block:n,hash,tx:hash,logIndex:0,time:stamp*1000,name:'CollateralDeposit',account:'7',market:'0',args:{amountCNS:'1000000'}});
const batch=(start,end)=>({start,end,hash,firstParentHash:hash,time:stamp*1000,rows:Array.from({length:end-start+1},(_,i)=>row(start+i))});
const dir=mkdtempSync(path.join(tmpdir(),'perpl-mixed-test-'));let indexer;
try{
 indexer=new Indexer({dataDir:dir,rpc,liveRpc:rpc,hypersync:{},futureRpc:rpc,futureStart:D+10});
 indexer.store.commit(D,D+3,hash,stamp*1000,batch(D,D+3).rows);
 let release;const pending=new Promise(r=>release=r);let mainStarted;
 const begun=new Promise(r=>mainStarted=r);
 indexer.parallel={workers:2,fetch:async(start,head)=>{mainStarted();await pending;return [{status:'fulfilled',value:batch(start,Math.min(head,start+20))}];}};
 indexer.future={workers:2,headers:new Map(),fetch:async()=>[{status:'fulfilled',value:batch(D+10,D+11)},{status:'rejected',reason:Error('Spectrum temporary failure')} ]};
 const running=indexer.tick();await begun;
 await indexer.futureTick();clearTimeout(indexer.futureTimer);
 assert.equal(indexer.store.get('futureNext'),D+12);
 assert.equal(indexer.store.get('next'),D+4,'Spectrum must progress while historical request is pending');
 assert.equal(indexer.store.futureStatus().events,2);
 assert.equal(indexer.store.protocol().deposits,4,'future rows must not contaminate continuous totals');
 assert.equal(indexer.store.history('7').rows.length,4);
 release();await running;clearTimeout(indexer.timer);
 assert.equal(indexer.store.get('next'),D+4,'in-flight overlap must retry without skipping');
 indexer.parallel={workers:2,fetch:async(start,head)=>[{status:'fulfilled',value:batch(start,Math.min(head,start+20))}]};
 await indexer.tick();clearTimeout(indexer.timer);assert.equal(indexer.store.get('next'),D+10);
 await indexer.tick();clearTimeout(indexer.timer);assert.equal(indexer.store.get('next'),D+12);
 assert.equal(indexer.store.futureStatus().batches,0);
 assert.equal(indexer.store.protocol().deposits,12);
 assert.equal(indexer.store.history('7').rows.length,12,'atomic merge must not duplicate events');
 // Late Spectrum completion after HyperSync overtakes its range is discarded.
 indexer.store.set('futureNext',D+12);indexer.store.commit(D+12,D+14,hash,stamp*1000,batch(D+12,D+14).rows);
 assert.equal(indexer.store.stageFuture(batch(D+12,D+13)),false);assert.equal(indexer.store.get('futureNext'),D+15);
 indexer.store.stageFuture(batch(D+15,D+16));
 indexer.stop();indexer.store.close();indexer=null;
 const reopened=new Store(path.join(dir,'index.sqlite'));
 assert.equal(reopened.get('futureNext'),D+17);assert.equal(reopened.firstFuture().start,D+15);
 // A bad join is never silently promoted or deleted.
 reopened.db.prepare('UPDATE future_batches SET parent=?').run('0x'+'b'.repeat(64));
 assert.throws(()=>reopened.promoteFuture(),/boundary mismatch/);assert.equal(reopened.get('next'),D+15);assert.equal(reopened.futureStatus().events,2);
 reopened.db.prepare('UPDATE future_batches SET parent=?').run(hash);
 assert.equal(reopened.promoteFuture(),true);assert.equal(reopened.get('next'),D+17);assert.equal(reopened.futureStatus().events,0);
 reopened.close();
}finally{if(indexer){indexer.stop();indexer.store.close();}assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));rmSync(dir,{recursive:true,force:true});}

const reference={block:async n=>header(n),call:async()=>[]};
const provider={block:async n=>{if(n<D+73){const e=Error('null block');e.code='SPECTRUM_NO_RESULT';throw e;}return header(n);},call:async()=>[]};
assert.equal((await findSpectrumStart(provider,reference,D,D+100)).start,D+100);
let edge=D+50000;
const moving={block:async n=>{edge+=5;if(n<edge){const e=Error('null block');e.code='SPECTRUM_NO_RESULT';throw e;}return header(n);},call:async()=>[]};
const buffered=await findSpectrumStart(moving,reference,D,D+100000);
assert.ok(buffered.start>edge+9000);assert.equal(buffered.marginBlocks,10000);
assert.ok(buffered.probes<15,'coarse probing should avoid chasing single-block precision');
// A failed buffered candidate moves forward automatically, without changing
// the historical checkpoint or suppressing authentication/quota failures.
let jumped=false;
const jump={block:async n=>{if(n>=D+60000&&n<D+70000)jumped=true;if(n<(jumped?D+65000:D+50000)){const e=Error('pruned');e.code='SPECTRUM_NO_RESULT';throw e;}return header(n);},call:async()=>[]};
assert.ok((await findSpectrumStart(jump,reference,D,D+100000)).start>=D+65000);
const limited={...provider,call:async()=>{const e=Error('Spectrum rate limit');e.retryMs=30000;throw e;}};
await assert.rejects(findSpectrumStart(limited,reference,D,D+100),/rate limit/);
const noLogs={...provider,call:async()=>{const e=Error('internal');e.rpcCode=-32603;throw e;}};
await assert.rejects(findSpectrumStart(noLogs,reference,D,D+100),/cannot serve/);
console.log('PASS: independent lanes, ordered gap merge, overlap races, staged persistence, no duplicate totals, hash mismatch preservation, retention boundary and throttle handling.');
