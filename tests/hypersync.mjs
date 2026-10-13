import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {abi,EXCHANGE,DEPLOYMENT_BLOCK,hex,decodeLogs} from '../indexer/chain.mjs';
import {historyQuery,parsePage,HyperSync} from '../indexer/hypersync.mjs';
import {Indexer} from '../indexer/service.mjs';
const start=DEPLOYMENT_BLOCK,hash='0x'+'a'.repeat(64),tx='0x'+'b'.repeat(64),timestamp=1770937347;
function event(name,args,index){const f=abi.getEvent(name),v=f.inputs.map(p=>args[p.name]??(p.type==='bool'?false:p.type==='bytes'?'0x':0n)),e=abi.encodeEventLog(f,v);return {address:EXCHANGE,block_number:start,block_hash:hash,transaction_hash:tx,log_index:index,data:e.data,topic0:e.topics[0],topic1:null,topic2:null,topic3:null};}
const request=event('OrderRequestV2',{accountId:7n,perpId:1n},0),taker=event('TakerOrderFilledV2',{feeCNS:101n,lotLNS:2n},1);
const block={number:start,timestamp,hash,parent_hash:hash};
const response={next_block:start+1,data:[{blocks:[block],logs:[request,taker]}]};
const page=parsePage(response,start,start+9);assert.equal(page.rows.length,1);assert.equal(page.rows[0].account,'7');assert.equal(page.rows[0].args.feeCNS,'101');
assert.deepEqual(parsePage({...response,data:{blocks:[[block]],logs:[[request,taker]]}},start,start+9).rows,page.rows);
assert.equal(historyQuery(start,start+9).to_block,start+10);
assert.equal(historyQuery(start,start+9).logs[0].topics[0].includes(request.topic0),false);
assert.equal(historyQuery(start,start+9).join_mode,'JoinAll');
assert.throws(()=>historyQuery(start-1,start),/Invalid/);
assert.throws(()=>parsePage({...response,next_block:start},start,start+9),/cursor/);
assert.throws(()=>parsePage({...response,next_block:start+11},start,start+9),/cursor/);
assert.throws(()=>parsePage({...response,data:[{blocks:[],logs:[taker]}]},start,start+9),/Incomplete/);
assert.throws(()=>parsePage({...response,data:[{blocks:[block],logs:[taker]}]},start,start+9),/missing OrderRequest/);
assert.throws(()=>parsePage({...response,data:[{blocks:[block],logs:[request,{...taker,block_hash:tx}]}]},start,start+9),/Inconsistent/);
assert.equal(parsePage({...response,data:[{blocks:[block],logs:[request,taker,{...taker,address:'0x'+'c'.repeat(40)}]}]},start,start+9).rows.length,1);
const toRpc=l=>({address:l.address,blockNumber:hex(l.block_number),blockHash:l.block_hash,transactionHash:l.transaction_hash,logIndex:hex(l.log_index),data:l.data,topics:[l.topic0],blockTimestamp:hex(timestamp)});
// A malformed pure request is skipped, but request context for actual fills is validated.
assert.deepEqual(decodeLogs([toRpc(request),toRpc(taker),{...toRpc(request),data:'0x',transactionHash:hash,logIndex:hex(2)}]),page.rows);
let called=false;const client=new HyperSync('test-only',{fetcher:async(url,options)=>{called=true;assert.equal(options.headers.Authorization,'Bearer test-only');assert.equal(options.redirect,'error');return new Response(JSON.stringify(response));}});
assert.deepEqual((await client.page(start,start+9)).rows,page.rows);assert.ok(called);
const throttled=new HyperSync('test-only',{fetcher:async()=>new Response('',{status:429,headers:{'retry-after':'2'}})});
await assert.rejects(throttled.page(start,start+9),e=>e.retryMs===2000);assert.ok(throttled.readyAt>Date.now());
const denied=new HyperSync('secret-test',{fetcher:async()=>new Response('secret-test',{status:401})});
await assert.rejects(denied.page(start,start+9),e=>e.message.includes('rejected')&&!e.message.includes('secret-test'));

const dir=mkdtempSync(path.join(tmpdir(),'perpl-hypersync-test-'));
let indexer;
try{
 const rpc={url:'https://rpc2.monad.xyz',call:async()=>hex(143),block:async(n)=>({number:hex(typeof n==='number'?n:start+100),timestamp:hex(timestamp),hash})};
 indexer=new Indexer({dataDir:dir,rpc,hypersync:{page:async()=>page}});
 indexer.stopped=true;await indexer.tick();assert.equal(indexer.store.get('next'),start); // stopped worker cannot commit
 indexer.stopped=false;await indexer.tick();clearTimeout(indexer.timer);
 assert.equal(indexer.store.get('next'),start+1);assert.equal(indexer.store.history('7').rows.length,1);assert.equal(indexer.store.get('source'),'HyperSync');
 // Failed second page leaves the committed first page intact.
 indexer.hypersync.page=async()=>{throw Error('Incomplete HyperSync page');};
 await indexer.tick();clearTimeout(indexer.timer);assert.equal(indexer.store.get('next'),start+1);assert.match(indexer.store.get('error'),/Incomplete/);
 // The storage budget pauses automatically, without dropping saved events.
 indexer.storageLimit=1;await indexer.tick();clearTimeout(indexer.timer);assert.equal(indexer.store.get('paused'),true);assert.equal(indexer.store.history('7').rows.length,1);
 console.log('PASS: HyperSync filtering, page cursor boundaries, complete taker context, malformed/mismatched responses, server-only token, throttling, checkpoint resume, failure retention and storage pause.');
}finally{if(indexer){indexer.stop();indexer.store.close();}assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));rmSync(dir,{recursive:true,force:true});}
