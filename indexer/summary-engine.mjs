import {randomUUID} from 'node:crypto';
import {Rpc} from './chain.mjs';
import {HyperSync} from './hypersync.mjs';
import {ParallelBackfill} from './parallel.mjs';
import {SpectrumBackfill,spectrumClient} from './spectrum.mjs';
import {REFRESH_MS} from './summary-spec.mjs';
import {LEADERBOARD_PATH,leaderboardWallet} from './leaderboard.mjs';
export class SummaryEngine {
 constructor(store,{refreshWallets=async()=>{},rpc=new Rpc(process.env.PERPL_LIVE_RPC_URL||'https://rpc.monad.xyz',150)}={}){this.store=store;this.rpc=rpc;this.owner=randomUUID();this.refreshWallets=refreshWallets;this.stopped=false;this.pending=new Map();
 this.hyper=process.env.ENVIO_API_TOKEN?new HyperSync(process.env.ENVIO_API_TOKEN):null;
 this.reader=this.hyper?new ParallelBackfill(this.hyper,process.env.PERPL_LIVE_RPC_URL||'https://rpc.monad.xyz',1):new SpectrumBackfill(process.env.SPECTRUM_ENDPOINT?spectrumClient():rpc,{workers:1,window:100});
 }
 async publicRead(path,force=false){
  const saved=this.store.cache(path);if(!force&&saved&&Date.now()-saved.at<REFRESH_MS)return {...saved,stale:false};
  if(!this.pending.has(path))this.pending.set(path,(async()=>{try{const r=await fetch('https://app.perpl.xyz/api'+path,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Perpl API unavailable');const data=await r.json();this.store.saveCache(path,data);return {...this.store.cache(path),stale:false};}catch(e){if(saved)return {...saved,stale:true,error:e.message};throw e;}finally{this.pending.delete(path)}})());return this.pending.get(path);
 }
 async leaderboard(address){return leaderboardWallet(await this.publicRead(LEADERBOARD_PATH),address);}
 async liquidationMarkets(){
  const ids=this.store.db.prepare('SELECT DISTINCT market FROM liquidation_details').all().map(r=>r.market),context=(await this.publicRead('/v1/pub/context')).data;
  const current=new Set(context.markets.map(m=>String(m.id))),resolved=[];
  for(const id of ids.filter(id=>!current.has(id))){
   const key='market-metadata:'+id;let meta=this.store.get(key);
   if(!meta){try{const [p]=await this.rpc.read('getPerpetualInfo',[Number(id)]);const priceDecimals=Number(p.priceDecimals),sizeDecimals=Number(p.lotDecimals);
    if(!p.symbol||![priceDecimals,sizeDecimals].every(n=>Number.isInteger(n)&&n>=0&&n<=18))continue;
    meta={id:Number(id),symbol:p.symbol+' (retired)',priceScale:10**priceDecimals,sizeScale:10**sizeDecimals};this.store.set(key,meta);
   }catch{continue;}}
   resolved.push(meta);
  }return resolved;
 }
 async fundingHistory(id){
  const ctx=(await this.publicRead('/v1/pub/context')).data;if(!ctx.markets.some(m=>String(m.id)===id))throw Error('Unknown market');
  const to=Math.floor(Date.now()/REFRESH_MS)*REFRESH_MS,from=to-30*86400000,key='funding-history:'+id,cached=this.store.cache(key);
  if(cached&&Date.now()-cached.at<REFRESH_MS)return {...cached.data,stale:false};
  if(!this.pending.has(key))this.pending.set(key,(async()=>{try{
   const market=ctx.markets.find(m=>String(m.id)===id),step=Math.max(60000,Math.floor(1000*Number(market.config?.funding_interval_sec||market.funding_interval_sec||2580)*1000));
   const rows=new Map();for(let start=from;start<to;start+=step){const end=Math.min(to,start+step);const r=await fetch('https://app.perpl.xyz/api/v1/market-data/'+id+'/funding/'+start+'-'+end,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Funding history unavailable');const d=await r.json();if(!Array.isArray(d.d))throw Error('Invalid funding history');for(const e of d.d)if(e.at?.t>=from&&e.at.t<=to&&Number.isFinite(e.rate))rows.set(e.at.t,{t:e.at.t,rate:e.rate/10000});}
   const result={from,to,rows:[...rows.values()].sort((a,b)=>a.t-b.t)};this.store.saveCache(key,result);return {...result,stale:false};
  }catch(e){if(cached)return {...cached.data,stale:true};throw e;}finally{this.pending.delete(key)}})());return this.pending.get(key);
 }
 start(){
  // Public snapshots have their own clock; historical catch-up can take longer.
  clearTimeout(this.snapshotTimer);this.refreshSnapshots();
  // Migrate older four-hour schedules, but retain a provider's persisted cooldown.
  const now=Date.now(),retryAt=this.store.get('retryAt',0)||0,last=this.store.get('lastRun',0)||0;
  const next=Math.max(retryAt,Math.min(this.store.get('nextRun',now)||now,last?last+REFRESH_MS:now));
  this.store.set('nextRun',next);this.timer=setTimeout(()=>this.cycle(),Math.max(0,next-now));
 }
 async refreshSnapshots(){if(this.stopped||this.snapshotRunning)return;this.snapshotRunning=true;
  try{await this.publicRead('/v1/pub/context');}catch{}finally{this.snapshotRunning=false;if(!this.stopped){const at=this.store.cache('/v1/pub/context')?.at||0;this.snapshotTimer=setTimeout(()=>this.refreshSnapshots(),Math.max(20000,at+REFRESH_MS-Date.now()));}}
 }
 async cycle(){if(this.stopped||this.cycling)return;this.cycling=true;
  if(!this.store.acquire(this.owner)){this.cycling=false;this.timer=setTimeout(()=>this.cycle(),60000);return;}
  this.heartbeat=setInterval(()=>this.store.acquire(this.owner),30000);this.store.set('running',true);this.store.set('nextRun',Date.now()+REFRESH_MS);
  this.store.set('lastAttempt',Date.now());this.store.set('retryAt',null);this.store.set('error','');
  const errors=[];
  try{
   // Retries must not force another market/wallet refresh during the same five-minute window.
   try{const publicResult=await this.publicRead('/v1/pub/context');if(publicResult.stale)errors.push('Market snapshot refresh failed; previous snapshot retained');}catch{errors.push('Market snapshot refresh failed');}
   if(Date.now()-(this.store.get('walletRefreshAt',0)||0)>=REFRESH_MS){try{await this.refreshWallets();this.store.set('walletRefreshAt',Date.now());}catch{errors.push('Some wallet snapshots could not refresh');}}
   const head=Number(BigInt((await this.rpc.block()).number))-64;
   const last=await this.rpc.block(this.store.get('next')-1);if(last.hash!==this.store.get('hash'))throw Error('Summary checkpoint hash mismatch; manual reconciliation required');
   const deadline=Date.now()+45*60*1000;
   while(!this.stopped&&this.store.get('next')<=head){
    if(Date.now()>deadline)throw Error('Update exceeded 45 minutes; saved progress will resume next cycle');
    const start=this.store.get('next'),end=Math.min(head,start+(this.hyper?1000:100)-1);
    const batch=await this.reader.range({start,end,source:this.hyper?'HyperSync':'RPC'});
    if(this.stopped)break;if(!this.store.acquire(this.owner))throw Error('Summary writer lease lost');this.store.commit(batch);
   }
   this.store.set('lastRun',Date.now());
  }catch(e){errors.push(e.message);if(Number.isFinite(e.retryMs)&&e.retryMs>0){const retryAt=Date.now()+Math.max(1000,e.retryMs);this.store.set('retryAt',retryAt);this.store.set('nextRun',retryAt);}}
  finally{this.store.set('error',errors.join(' · '));clearInterval(this.heartbeat);this.store.set('running',false);this.store.release(this.owner);this.cycling=false;if(!this.stopped)this.timer=setTimeout(()=>this.cycle(),Math.max(1000,this.store.get('nextRun')-Date.now()));}
 }
 stop(){this.stopped=true;clearTimeout(this.timer);clearTimeout(this.snapshotTimer);clearInterval(this.heartbeat);this.store.release(this.owner);}
}
