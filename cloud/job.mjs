import {randomUUID} from 'node:crypto';
import {Rpc} from '../indexer/chain.mjs';
import {HyperSync} from '../indexer/hypersync.mjs';
import {SpectrumRpc,SpectrumBackfill} from '../indexer/spectrum.mjs';
import {storageLimit} from './cache-policy.mjs';
const INTERVAL=300000;
export async function incrementalBatch(start,head,{rpc,hyper,reader}){
 if(!hyper)return reader.range({start,end:Math.min(head,start+99)});
 // Commit each complete HyperSync page, including its pagination boundary.
 const page=await hyper.page(start,Math.min(head,start+4999)),end=page.next-1;
 const first=await rpc.block(start),last=start===end?first:await rpc.block(end);
 for(const n of new Set([start,end,...[...page.blocks.keys()].sort((a,b)=>b-a).slice(0,1)])){
  const archived=page.blocks.get(n);if(!archived)continue;
  const actual=n===start?first:n===end?last:await rpc.block(n);
  if(archived.hash!==actual.hash)throw Error('Source hash mismatch');
 }
 return {start,end,hash:last.hash,firstParentHash:first.parentHash,time:Number(BigInt(last.timestamp))*1000,rows:page.rows};
}
export async function runJob(store,{env=process.env,makeSources,snapshot=async()=>{},budgetMs=20000}={}){
 const owner=randomUUID(),started=Date.now();
 if(!await store.acquire(owner))return {status:'busy'};
 let batches=0,head=null;const signal=AbortSignal.timeout(budgetMs);
 try{
  const retryAt=await store.get('retryAt',0)||0;
  // Preserve provider cooldown across cold starts and deployments.
  if(retryAt>started)return {status:'cooldown',retryAt};
  if((await store.get('nextRun',0)||0)>started)return {status:'scheduled',nextRun:await store.get('nextRun')};
  await store.set('lastAttempt',started);await store.set('nextRun',(Math.floor(started/INTERVAL)+1)*INTERVAL);
  if(await store.maintenance()>storageLimit(env))throw Object.assign(Error('Cloud storage safety limit reached; checkpoint retained'),{safeMessage:true});
  const boundedFetch=(url,options={})=>fetch(url,{...options,signal:AbortSignal.any([signal,...(options.signal?[options.signal]:[])])});
  const rpc=new Rpc(env.PERPL_LIVE_RPC_URL||'https://rpc.monad.xyz',30,{attempts:1,timeoutMs:6000,signal});
  const hyper=env.ENVIO_API_TOKEN?new HyperSync(env.ENVIO_API_TOKEN,{fetcher:boundedFetch}):null;
  const archiveRpc=env.SPECTRUM_ENDPOINT?new SpectrumRpc(env.SPECTRUM_ENDPOINT,{mode:env.SPECTRUM_MODE||'rpc',rps:2,fetcher:boundedFetch}):rpc;
  const sources=makeSources?await makeSources(signal):{rpc,hyper,reader:new SpectrumBackfill(archiveRpc,{workers:1,window:100})};
  const snapshotResult=Promise.resolve().then(()=>snapshot()).catch(()=>null);
  try{
   const latest=await sources.rpc.block();head=Number(BigInt(latest.number))-64;
   const previous=await sources.rpc.block(await store.get('next')-1);
   if(previous.hash!==await store.get('hash'))throw Object.assign(Error('Checkpoint hash mismatch; reconciliation required'),{safeMessage:true});
   while(Date.now()-started<budgetMs-5000){
    const start=await store.get('next');if(start>head)break;
    const batch=await incrementalBatch(start,head,sources);signal.throwIfAborted();
    await store.commit(batch,owner);batches++;
   }
   await store.set('lastRun',Date.now());await store.set('error','');await store.set('retryAt',null);
  }finally{await snapshotResult;}
  return {status:await store.get('next')>head?'caught-up':'catching-up',batches,nextBlock:await store.get('next'),head};
 }catch(e){
  const cooldown=Number.isFinite(e.retryMs)&&e.retryMs>0?Math.max(INTERVAL,e.retryMs):INTERVAL;
  const retryAt=Date.now()+cooldown;await store.set('retryAt',retryAt);await store.set('nextRun',retryAt);
  const error=e.safeMessage?e.message:signal.aborted?'Refresh time budget reached; saved progress will resume':'Provider update failed; saved progress will retry';
  await store.set('error',error);return {status:'retrying',batches,nextBlock:await store.get('next'),retryAt,error};
 }finally{await store.release(owner);}
}
