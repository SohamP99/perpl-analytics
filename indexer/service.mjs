import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {statfsSync} from 'node:fs';
import {HyperSync,HYPERSYNC_URL} from './hypersync.mjs';
import {ParallelBackfill} from './parallel.mjs';
import {SpectrumRpc,SpectrumBackfill,spectrumConfigured,spectrumMixed,spectrumClient} from './spectrum.mjs';
import {resumePoint} from './resume-point.mjs';
import {Store} from './store.mjs';
import {REFRESH_MS} from './summary-spec.mjs';
import {Rpc,EXCHANGE,DEPLOYMENT_BLOCK,HISTORY_START,topics,hex,decodeLogs,positionView,positionIds} from './chain.mjs';
export const defaultDataDir=fileURLToPath(new URL('../.perpl-data/',import.meta.url));
export class Indexer {
  constructor({dataDir=process.env.PERPL_DATA_DIR||defaultDataDir,rpc=spectrumConfigured()?spectrumClient():new Rpc(undefined,100),liveRpc=spectrumConfigured()||spectrumMixed()?spectrumClient(process.env,{live:true}):new Rpc(process.env.PERPL_LIVE_RPC_URL||'https://rpc.monad.xyz',200),hypersync=!spectrumConfigured()&&process.env.ENVIO_API_TOKEN?new HyperSync(process.env.ENVIO_API_TOKEN):null,futureRpc=spectrumMixed()?spectrumClient():null,futureStart=Number(process.env.SPECTRUM_START_BLOCK)}={}){
    this.store=new Store(path.join(dataDir,'index.sqlite'));this.rpc=rpc;this.live=liveRpc;this.owner=randomUUID();this.stopped=false;this.pending=new Map();this.context=null;this.contextAt=0;this.reconciled=false;
    this.hypersync=hypersync;this.dataDir=dataDir;this.measurements=[];
    const workers=Number(process.env.PERPL_BACKFILL_WORKERS||3);
    if(!Number.isInteger(workers)||workers<1||workers>3)throw Error('PERPL_BACKFILL_WORKERS must be 1, 2 or 3');
    this.parallel=rpc instanceof SpectrumRpc?new SpectrumBackfill(rpc,{workers:Number(process.env.SPECTRUM_WORKERS||2),window:Number(process.env.SPECTRUM_WINDOW_BLOCKS||100)}):hypersync instanceof HyperSync&&workers>1?new ParallelBackfill(hypersync,rpc.url,workers):null;
    this.source=rpc instanceof SpectrumRpc?'Spectrum':this.hypersync?'HyperSync':'Public RPC';
    this.storageLimit=Number(process.env.PERPL_STORAGE_LIMIT_GB||10)*1024**3;
    if(!Number.isFinite(this.storageLimit)||this.storageLimit<1024**3)throw Error('PERPL_STORAGE_LIMIT_GB must be at least 1');
    this.store.set('storageLimitBytes',this.storageLimit);
    this.futureRpc=futureRpc;
    if(futureRpc){
      if(!hypersync)throw Error('Parallel Spectrum/HyperSync mode requires the saved HyperSync token');
      if(!Number.isSafeInteger(futureStart)||futureStart<DEPLOYMENT_BLOCK)throw Error('Run Spectrum parallel setup to choose a verified start block');
      this.future=new SpectrumBackfill(futureRpc,{workers:Number(process.env.SPECTRUM_WORKERS||2),window:Number(process.env.SPECTRUM_WINDOW_BLOCKS||100)});
      if(!this.store.get('futureNext'))this.store.set('futureNext',Math.max(futureStart,this.store.get('next')));
    }
  }
  start(){this.heartbeat=setInterval(()=>{if(!this.stopped)this.store.db.prepare('UPDATE lease SET expires=? WHERE owner=?').run(Date.now()+120000,this.owner);},30000);this.timer=setTimeout(()=>this.tick(),50);if(this.future)this.futureTimer=setTimeout(()=>this.futureTick(),100);}
  canWrite(){
    if(this.stopped||this.store.get('paused',false)||!this.store.acquire(this.owner))return false;
    const disk=statfsSync(this.dataDir);
    if(this.store.storageBytes()>=this.storageLimit||disk.bavail*disk.bsize<5*1024**3){this.store.set('paused',true);this.store.set('error','Storage safety pause: saved history and Spectrum batches retained.');return false;}
    return true;
  }
  async futureTick(){let delay=50;try{
    if(!this.canWrite()){delay=3000;return;}
    this.store.set('futureEnabled',true);this.store.set('futureWorkers',this.future.workers);
    if(!this.futureReconciled){
      if(Number(BigInt(await this.futureRpc.call('eth_chainId',[])))!==143)throw Error('Expected Spectrum Monad mainnet');
      const last=this.store.lastFuture();if(last&&(await this.rpc.block(last.end)).hash!==last.hash)throw Error('Saved Spectrum batch hash changed; retained for reconciliation');
      this.futureReconciled=true;
    }
    const head=Number(BigInt((await this.futureRpc.block()).number))-64;
    const next=Math.max(this.store.get('futureNext'),this.store.get('next'));this.store.set('futureNext',next);
    if(next>head){delay=3000;return;}
    const results=await this.future.fetch(next,head);
    for(const result of results){
      if(result.status==='rejected')throw result.reason;
      if(!this.canWrite())return;
      if(!this.store.stageFuture(result.value))return;
    }
  }catch(e){this.future.headers.clear();this.futureReconciled=false;this.store.set('futureError',e.message);delay=e.retryMs||15000;}
  finally{if(!this.stopped)this.futureTimer=setTimeout(()=>this.futureTick(),delay);}}
  async tick(){let delay=50;try{
    if(!this.store.acquire(this.owner)){delay=10000;return;}
    this.store.set('futureEnabled',!!this.future);
    if(this.store.get('paused',false)){delay=3000;return;}
    const disk=statfsSync(this.dataDir),used=this.store.storageBytes();
    if(used>=this.storageLimit||disk.bavail*disk.bsize<5*1024**3){this.store.set('paused',true);this.store.set('error','Storage safety pause: database budget reached or less than 5 GiB free. Saved history is preserved.');return;}
    if(!this.reconciled){
      if(Number(BigInt(await this.rpc.call('eth_chainId',[])))!==143)throw Error('Expected Monad mainnet (chain 143)');
      // A replacement provider only needs the saved boundary and remaining history.
      // Fresh databases still verify the February deployment. Never jump to a date.
      const boundary=this.source==='Spectrum'?resumePoint(this.store.get('next'),this.store.lastBatch()).verifyBlock:DEPLOYMENT_BLOCK;
      const verified=await this.rpc.block(boundary);if(Number(BigInt(verified.number))!==boundary||Number(BigInt(verified.timestamp))*1000<HISTORY_START)throw Error('Invalid history boundary block');
      for(let b=this.store.lastBatch();b;b=this.store.lastBatch()){const actual=await this.rpc.block(b.end);if(actual.hash===b.hash)break;this.store.rollback(b);}
      this.reconciled=true;this.store.set('workers',this.parallel?.workers||1);this.store.set('rpcHost',this.source==='Spectrum'?'Spectrum (private endpoint)':new URL(this.rpc.url).hostname);this.store.set('source',this.source);this.store.set('historyHost',this.source==='Spectrum'?'Spectrum (private endpoint)':new URL(this.hypersync?HYPERSYNC_URL:this.rpc.url).hostname);
    }
    if(!this.headAt||Date.now()-this.headAt>30000){const latest=await this.rpc.block();this.store.set('head',Math.max(DEPLOYMENT_BLOCK-1,Number(BigInt(latest.number))-64));this.headAt=Date.now();}
    const start=this.store.get('next');let head=this.store.get('head');
    const staged=this.store.firstFuture();
    if(staged&&staged.start<start)throw Error('Staged history overlaps main checkpoint; saved data retained');
    if(staged?.start===start){
      if((await this.rpc.block(staged.end)).hash!==staged.hash)throw Error('Spectrum batch/reference hash mismatch; saved data retained');
      if(this.canWrite())this.store.promoteFuture();return;
    }
    if(staged)head=Math.min(head,staged.start-1);
    if(start>head){delay=3000;return;}
    if(!this.measurements.length)this.measurements.push({time:Date.now(),next:start});
      if(this.parallel){
        this.store.set('workers',this.parallel.workers);
        const results=await this.parallel.fetch(start,head);
        for(const result of results){
          if(result.status==='rejected')throw result.reason;
          if(this.stopped||this.store.get('paused',false)||!this.store.acquire(this.owner))return;
          const disk=statfsSync(this.dataDir);
          if(this.store.storageBytes()>=this.storageLimit||disk.bavail*disk.bsize<5*1024**3){this.store.set('paused',true);this.store.set('error','Storage safety pause: database budget reached or less than 5 GiB free. Saved history is preserved.');return;}
          const batch=result.value,previous=this.store.lastBatch();
          if(previous&&batch.firstParentHash!==previous.hash)throw Error('Parallel batch parent mismatch; checkpoint retained');
          this.store.commit(batch.start,batch.end,batch.hash,batch.time,batch.rows);this.recordSpeed();
        }
        return;
      }

    if(this.hypersync){
      if(this.hypersync.readyAt>Date.now()){delay=this.hypersync.readyAt-Date.now();return;}
      this.store.set('workers',1);
      const page=await this.hypersync.page(start,head),end=page.next-1;
      const block=await this.rpc.block(end);
      const archived=page.blocks.get(end);
      if(archived&&archived.hash!==block.hash)throw Error('HyperSync/RPC block mismatch; checkpoint retained');
      const lastMatched=Math.max(-1,...page.blocks.keys());
      if(lastMatched>=start&&lastMatched!==end&&(await this.rpc.block(lastMatched)).hash!==page.blocks.get(lastMatched).hash)throw Error('HyperSync/RPC history mismatch; checkpoint retained');
      const previous=this.store.lastBatch();
      if(previous&&page.blocks.has(start)&&page.blocks.get(start).parent_hash&&page.blocks.get(start).parent_hash!==previous.hash)throw Error('Chain changed between pages');
      if(!this.store.acquire(this.owner)||this.stopped)return;
      this.store.commit(start,end,block.hash,Number(BigInt(block.timestamp))*1000,page.rows);
      this.recordSpeed();return;
    }
    const range=this.store.get('range',10000),end=Math.min(head,start+range-1);
    let logs;try{logs=await this.rpc.call('eth_getLogs',[{address:EXCHANGE,fromBlock:hex(start),toBlock:hex(end),topics:[topics]}]);}
    catch(e){if(/range|too many results|limit exceeded|response.*large/i.test(e.message)&&range>1){this.store.set('range',Math.max(1,Math.floor(range/2)));return;}throw e;}
    if(!Array.isArray(logs))throw Error('Invalid log response');
    if(logs.length>=10000){if(range>1){this.store.set('range',Math.max(1,Math.floor(range/2)));return;}throw Error('Single-block log response reached safety cap; checkpoint retained. A complete response is required.');}
    const times=new Map();for(const log of logs){if(!log.blockTimestamp){const n=Number(BigInt(log.blockNumber));if(!times.has(n))times.set(n,Number(BigInt((await this.rpc.block(n)).timestamp))*1000);}}
    const block=await this.rpc.block(end);
    if(logs.some(l=>Number(BigInt(l.blockNumber))===end&&l.blockHash!==block.hash))throw Error('Chain changed during batch; retrying');
    const rows=decodeLogs(logs,times);if(!this.store.acquire(this.owner)||this.stopped)return;
    this.store.commit(start,end,block.hash,Number(BigInt(block.timestamp))*1000,rows);this.recordSpeed();
    // Recover larger windows after a dense stretch, never exceed public RPC limits.
    if(logs.length<3000&&range<10000)this.store.set('range',Math.min(10000,range*2));
  }catch(e){this.parallel?.headers?.clear();this.store.set('error',e.message);delay=e.retryMs||15000;this.reconciled=false;}
  finally{if(!this.stopped)this.timer=setTimeout(()=>this.tick(),delay);else this.store.release(this.owner);}}
  recordSpeed(){
    const current={time:Date.now(),next:this.store.get('next')};this.measurements.push(current);
    while(this.measurements.length>2&&current.time-this.measurements[1].time>120000)this.measurements.shift();
    const first=this.measurements[0],seconds=(current.time-first.time)/1000,rate=(current.next-first.next)/seconds;
    if(seconds>=10&&rate>0)this.store.set('speed',{blocksPerSecond:rate,etaSeconds:Math.max(0,(this.store.get('head')-current.next+1)/rate),measuredAt:current.time,sampleSeconds:seconds});
  }
  async getContext(){if(this.context&&Date.now()-this.contextAt<60000)return this.context;const r=await fetch('https://app.perpl.xyz/api/v1/pub/context',{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Perpl context unavailable');const c=await r.json();if(c.chain.chain_id!==143||!c.instances.some(i=>i.address.toLowerCase()===EXCHANGE))throw Error('Unexpected Perpl deployment');this.context=c;this.contextAt=Date.now();return c;}
  async readWallet(address){
    const c=await this.getContext(),b=await this.live.block(),block=Number(BigInt(b.number));
    let a;try{[a]=await this.live.read('getAccountByAddr',[address],block,address);}catch(e){if(e.contractError!=='AccountDoesNotExist')throw e;a={accountId:0n,balanceCNS:0n,lockedBalanceCNS:0n};}
    const data={address,account:String(a.accountId),balance:Number(a.balanceCNS)/1e6,locked:Number(a.lockedBalanceCNS)/1e6,available:Math.max(0,Number(a.balanceCNS-a.lockedBalanceCNS)/1e6),positions:[],block,blockTime:Number(BigInt(b.timestamp))*1000,errors:[]};
    if(a.accountId>0n){
      const ids=positionIds(a.positions);
      for(const id of ids){const m=c.markets.find(m=>m.id===id);if(!m){data.errors.push('Market '+id+' is not in public metadata; position not decoded.');continue;}
        try{const [p,mark,valid]=await this.live.read('getPositionV2',[id,a.accountId],block,address);if(p.lotLNS===0n)continue;const margins=await this.live.read('getMarginFractions',[id,p.lotLNS],block,address);data.positions.push(positionView(p,m,margins.perpMaintMarginFracHdths,mark,valid));}
        catch(e){data.errors.push('Market '+id+': '+e.message);}
      }
    }
    this.store.saveSnapshot(address,data);return {...data,at:Date.now()};
  }
  async wallet(address,kind='all',page=0,through,{currentOnly=false,force=false}={}){
    if(!/^0x[a-f0-9]{40}$/.test(address))throw Error('Invalid wallet address');
    let data=this.store.snapshot(address),liveError='';
    if(!data||(force&&Date.now()-data.at>=10000)||Date.now()-data.at>(currentOnly?REFRESH_MS:30000)){
      if(!this.pending.has(address)){if(this.pending.size>=4)throw Error('Wallet lookup busy; retry shortly');const p=this.readWallet(address).finally(()=>this.pending.delete(address));this.pending.set(address,p);}
      try{data=await this.pending.get(address);}catch(e){if(!data)throw e;liveError=e.message;}
    }
    if(currentOnly)return {...data,liveError};
    return {...data,liveError,history:this.store.history(data.account,kind,page,through),stats:this.store.walletStats(data.account),coverage:this.store.status()};
  }
  stop(){this.stopped=true;clearTimeout(this.timer);clearTimeout(this.futureTimer);clearInterval(this.heartbeat);this.store.release(this.owner);}
}
