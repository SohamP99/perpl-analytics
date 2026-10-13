import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {SpectrumRpc,SpectrumBackfill,RequestGate,retryDelay,endpointUrl,spectrumConfigured} from '../indexer/spectrum.mjs';
import {abi,EXCHANGE,DEPLOYMENT_BLOCK,hex} from '../indexer/chain.mjs';
import {Indexer} from '../indexer/service.mjs';
const start=DEPLOYMENT_BLOCK,hash='0x'+'a'.repeat(64),tx='0x'+'b'.repeat(64),stamp=1770937347,endpoint='https://private.simplystaking.xyz/SECRET/v1';
function log(n=start){const f=abi.getEvent('CollateralDeposit'),e=abi.encodeEventLog(f,f.inputs.map(p=>p.name==='accountId'?7n:p.name==='amountCNS'?1000000n:0n));return {...e,address:EXCHANGE,blockNumber:hex(n),blockHash:hash,transactionHash:tx,logIndex:'0x0',removed:false};}
const headers=n=>({number:hex(n),hash,parentHash:hash,timestamp:hex(stamp)});
const seen=[];
const fetcher=async(url,options)=>{assert.equal(url,endpoint);assert.equal(options.redirect,'error');const b=JSON.parse(options.body),proxy=b.method==='rpcProxy',method=proxy?b.params.method:b.method,params=proxy?b.params.params:b.params;seen.push({method,params});if(proxy)assert.equal(b.params.chain,'monad');let result;
 if(method==='eth_chainId')result=hex(143);
 else if(method==='eth_getBlockByNumber')result=headers(params[0]==='latest'?start+10000:Number(BigInt(params[0])));
 else if(method==='eth_getLogs'){assert.equal(params[0].address,EXCHANGE);result=[log(Number(BigInt(params[0].fromBlock)))];}
 else throw Error('Unexpected method');
 return new Response(JSON.stringify({jsonrpc:'2.0',id:b.id,result:proxy?{data:{jsonrpc:'2.0',id:b.id,result}}:result}));};
for(const mode of ['rpc','api']){
 const client=new SpectrumRpc(endpoint,{mode,fetcher,rps:150}),scanner=new SpectrumBackfill(client,{workers:2,window:2});
 assert.equal(await client.call('eth_chainId',[]),hex(143));
 const results=await scanner.fetch(start,start+3);assert.ok(results.every(r=>r.status==='fulfilled'));assert.deepEqual(results.map(r=>[r.value.start,r.value.end]),[[start,start+1],[start+2,start+3]]);
 assert.equal(results[0].value.rows[0].time,stamp*1000);assert.equal(results[0].value.rows[0].account,'7');
 await assert.rejects(client.call('eth_sendRawTransaction',['0x']),/read-only/);
 assert.ok(!JSON.stringify(client).includes('SECRET'));
}
assert.throws(()=>endpointUrl('http://localhost/SECRET'),/HTTPS/);assert.equal(spectrumConfigured({SPECTRUM_ENDPOINT:endpoint}),true);assert.equal(spectrumConfigured({SPECTRUM_ENDPOINT:endpoint,PERPL_HISTORY_SOURCE:'hypersync'}),false);
assert.equal(retryDelay(new Headers({'x-ratelimit-reset':'1030'}),1000000),30000);
assert.equal(retryDelay(new Headers({'retry-after':'2'})),2000);
const limited=new SpectrumRpc(endpoint,{fetcher:async()=>new Response('',{status:429,headers:{'retry-after':'2'}})});
await assert.rejects(limited.call('eth_chainId',[]),e=>e.retryMs===2000);assert.ok(limited.gate.readyAt>Date.now());
assert.equal(limited.gate.spacing,200);limited.gate.throttle(2000);assert.equal(limited.gate.spacing,200,'one incident halves rate once');
const bad=new SpectrumRpc(endpoint,{fetcher:async(url,o)=>new Response(JSON.stringify({id:JSON.parse(o.body).id,error:{code:-1,message:endpoint}}))});
await assert.rejects(bad.call('eth_chainId',[]),e=>!e.message.includes('SECRET')&&!e.message.includes('https://'));
const nested=new SpectrumRpc(endpoint,{mode:'api',fetcher:async(url,o)=>new Response(JSON.stringify({id:JSON.parse(o.body).id,result:{data:{jsonrpc:'2.0',error:{code:-1,message:endpoint}}}}))});
await assert.rejects(nested.call('eth_chainId',[]),e=>e.message.startsWith('Spectrum RPC error')&&!e.message.includes('SECRET'));
const wrongId=new SpectrumRpc(endpoint,{fetcher:async()=>new Response(JSON.stringify({id:999,result:hex(143)}))});await assert.rejects(wrongId.call('eth_chainId',[]),/ID mismatch/);
for(const mode of ['rpc','api']){
 const empty=new SpectrumRpc(endpoint,{mode,fetcher:async(url,o)=>{const b=JSON.parse(o.body);return new Response(JSON.stringify({id:b.id,result:mode==='api'?{data:{jsonrpc:'2.0',result:null}}:null}));}});
 await assert.rejects(empty.block(start),e=>e.code==='SPECTRUM_NO_RESULT'&&e.message.includes('eth_getBlockByNumber')&&e.message.includes(String(start))&&!e.message.includes('SECRET'));
}
let active=0,maxActive=0;const gate=new RequestGate(150,2);
await Promise.all(Array.from({length:8},()=>gate.run(async()=>{active++;maxActive=Math.max(maxActive,active);await new Promise(r=>setTimeout(r,20));active--;})));assert.ok(maxActive<=2);
// A provider range restriction must subdivide, never silently return empty history.
const splitRpc={block:async n=>headers(n),call:async(method,[filter])=>{const from=Number(BigInt(filter.fromBlock)),to=Number(BigInt(filter.toBlock));if(to>from)throw Error('Spectrum log range/result limit');return [log(from)];}};
const split=new SpectrumBackfill(splitRpc,{workers:1,window:4});const batch=await split.range({start,end:start+3});assert.equal(batch.rows.length,4);
// Actual provider wording observed in the authenticated endpoint response.
const sizeLimited=new SpectrumRpc(endpoint,{rps:150,fetcher:async(url,o)=>{
 const b=JSON.parse(o.body);
 if(b.method==='eth_getLogs'&&BigInt(b.params[0].toBlock)>BigInt(b.params[0].fromBlock))return new Response(JSON.stringify({id:b.id,error:{code:-32000,message:'response exceeds size limit'}}));
 return fetcher(url,o);
}});
const recovered=await new SpectrumBackfill(sizeLimited,{workers:1,window:4}).range({start,end:start+3});assert.equal(recovered.rows.length,4);
await assert.rejects(new SpectrumBackfill({...splitRpc,call:async()=>Array(1000).fill(log())},{window:1}).range({start,end:start}),/single-block/);
await assert.rejects(new SpectrumBackfill({...splitRpc,block:async()=>({...headers(start),hash:tx})},{window:1}).range({start,end:start}),/mismatch/);

const dir=mkdtempSync(path.join(tmpdir(),'perpl-spectrum-test-'));let indexer;
try{
 const client=new SpectrumRpc(endpoint,{fetcher,rps:150});indexer=new Indexer({dataDir:dir,rpc:client,liveRpc:client,hypersync:null});
 indexer.parallel=new SpectrumBackfill(client,{workers:2,window:2});
 await indexer.tick();clearTimeout(indexer.timer);assert.equal(indexer.store.get('source'),'Spectrum');assert.equal(indexer.store.get('next'),start+4);assert.ok(!JSON.stringify(indexer.store.status()).includes('SECRET'));
 const before=indexer.store.get('next');indexer.parallel.rpc.call=async()=>{throw Error('Spectrum HTTP 403');};await indexer.tick();clearTimeout(indexer.timer);assert.equal(indexer.store.get('next'),before);
 console.log('PASS: Spectrum direct/proxy formats, credentials redacted, read-only methods, chain logs/timestamps, parallel ranges, adaptive splitting, truncation guard, shared throttling, source selection and checkpoint preservation.');
}finally{if(indexer){indexer.stop();indexer.store.close();}assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));rmSync(dir,{recursive:true,force:true});}
