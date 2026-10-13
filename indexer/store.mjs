import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,statSync} from 'node:fs';
import path from 'node:path';
import {DEPLOYMENT_BLOCK,HISTORY_START,stringify} from './chain.mjs';
import {protocolView} from './protocol-cache.mjs';
export class Store {
  constructor(file){
    this.file=file;
    mkdirSync(path.dirname(file),{recursive:true});this.db=new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY,block INTEGER NOT NULL,hash TEXT NOT NULL,tx TEXT NOT NULL,log_index INTEGER NOT NULL,time INTEGER NOT NULL,name TEXT NOT NULL,account TEXT NOT NULL,market TEXT NOT NULL,args TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS events_account ON events(account,time DESC,block DESC,log_index DESC);
      CREATE INDEX IF NOT EXISTS events_name ON events(name,time);
      CREATE INDEX IF NOT EXISTS events_block ON events(block);
      CREATE TABLE IF NOT EXISTS batches (start INTEGER PRIMARY KEY,end INTEGER NOT NULL,hash TEXT NOT NULL,time INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS future_batches (start INTEGER PRIMARY KEY,end INTEGER NOT NULL,hash TEXT NOT NULL,parent TEXT NOT NULL,time INTEGER NOT NULL,rows TEXT NOT NULL,event_count INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS snapshots (address TEXT PRIMARY KEY,time INTEGER NOT NULL,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS lease (id INTEGER PRIMARY KEY,owner TEXT NOT NULL,expires INTEGER NOT NULL);`);
    this.put=this.db.prepare('INSERT OR IGNORE INTO events VALUES(?,?,?,?,?,?,?,?,?,?)');
    if(!this.get('next'))this.set('next',DEPLOYMENT_BLOCK);
  }
  get(k,fallback=null){const r=this.db.prepare('SELECT value FROM meta WHERE key=?').get(k);return r?JSON.parse(r.value):fallback;}
  storageBytes(){return ['','-wal','-shm'].reduce((sum,suffix)=>{try{return sum+statSync(this.file+suffix).size;}catch(e){if(e.code==='ENOENT')return sum;throw e;}},0);}
  set(k,v){this.db.prepare('INSERT INTO meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k,stringify(v));}
  acquire(owner){this.db.prepare('INSERT INTO lease VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires=excluded.expires WHERE lease.expires<? OR lease.owner=?').run(owner,Date.now()+120000,Date.now(),owner);return this.db.prepare('SELECT owner FROM lease WHERE id=1').get()?.owner===owner;}
  release(owner){this.db.prepare('DELETE FROM lease WHERE owner=?').run(owner);}
  commit(start,end,hash,time,rows,stagedStart=null){
    if(start!==this.get('next'))throw Error('Noncontiguous batch');
    const future=this.firstFuture();if(stagedStart===null&&future&&end>=future.start)throw Error('Future range arrived during gap fetch; retrying without overlap');
    this.db.exec('BEGIN IMMEDIATE');try{
      for(const e of rows){if(e.block<start||e.block>end||e.time<HISTORY_START)throw Error('Event outside indexed range');this.put.run(e.id,e.block,e.hash,e.tx,e.logIndex,e.time,e.name,e.account,e.market,stringify(e.args));}
      this.db.prepare('INSERT INTO batches VALUES(?,?,?,?)').run(start,end,hash,time);
      if(stagedStart!==null){const staged=this.firstFuture();if(!staged||staged.start!==start||staged.end!==end||staged.hash!==hash)throw Error('Staged batch changed before promotion');this.db.prepare('DELETE FROM future_batches WHERE start=?').run(stagedStart);}
      this.set('next',end+1);this.set('indexedTime',time);this.set('updated',Date.now());this.set('error','');this.db.exec('COMMIT');
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  lastBatch(){return this.db.prepare('SELECT * FROM batches ORDER BY end DESC LIMIT 1').get();}
  firstFuture(){return this.db.prepare('SELECT start,end,hash,parent,time,event_count FROM future_batches ORDER BY start LIMIT 1').get();}
  lastFuture(){return this.db.prepare('SELECT start,end,hash,parent,time,event_count FROM future_batches ORDER BY start DESC LIMIT 1').get();}
  stageFuture(batch){
    const {start,end,hash,firstParentHash,time,rows}=batch;
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end<start||start<DEPLOYMENT_BLOCK||!/^0x[0-9a-f]{64}$/i.test(hash)||!/^0x[0-9a-f]{64}$/i.test(firstParentHash)||time<HISTORY_START)throw Error('Invalid future batch');
    if(start<this.get('next')){this.set('futureNext',Math.max(this.get('next'),this.get('futureNext',start)));return false;}
    if(start!==this.get('futureNext'))throw Error('Noncontiguous Spectrum checkpoint');
    const previous=this.lastFuture();if(previous&&(previous.end+1!==start||previous.hash!==firstParentHash))throw Error('Spectrum staged boundary mismatch; data retained');
    for(const row of rows)if(row.block<start||row.block>end||row.time<HISTORY_START)throw Error('Future event outside indexed range');
    this.db.exec('BEGIN IMMEDIATE');try{
      this.db.prepare('INSERT INTO future_batches VALUES(?,?,?,?,?,?,?)').run(start,end,hash,firstParentHash,time,stringify(rows),rows.length);
      this.set('futureNext',end+1);this.set('futureTime',time);this.set('futureUpdated',Date.now());this.set('futureError','');this.db.exec('COMMIT');return true;
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  promoteFuture(){
    const b=this.firstFuture();if(!b||b.start!==this.get('next'))return false;
    const previous=this.lastBatch();if(previous&&previous.hash!==b.parent)throw Error('Gap/Spectrum boundary mismatch; data retained');
    const rows=JSON.parse(this.db.prepare('SELECT rows FROM future_batches WHERE start=?').get(b.start).rows);
    this.commit(b.start,b.end,b.hash,b.time,rows,b.start);return true;
  }
  futureStatus(){const r=this.db.prepare('SELECT MIN(start) start,MAX(end) end,COALESCE(SUM(event_count),0) events,COUNT(*) batches FROM future_batches').get();return {...r,enabled:this.get('futureEnabled',false),next:this.get('futureNext'),time:this.get('futureTime'),updated:this.get('futureUpdated'),error:this.get('futureError',''),workers:this.get('futureWorkers',0)};}
  rollback(batch){this.db.exec('BEGIN IMMEDIATE');try{this.db.prepare('DELETE FROM events WHERE block>=?').run(batch.start);this.db.prepare('DELETE FROM batches WHERE start>=?').run(batch.start);this.set('next',batch.start);this.set('historyRevision',this.get('historyRevision',0)+1);this.set('indexedTime',this.lastBatch()?.time??null);this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}}
  status(){const next=this.get('next'),head=this.get('head'),total=this.db.prepare('SELECT count(*) n FROM events').get().n;const lease=this.db.prepare('SELECT expires FROM lease WHERE id=1').get();return {future:this.futureStatus(),startDate:new Date(HISTORY_START).toISOString(),deploymentDate:'2026-02-11T23:02:27.000Z',startBlock:DEPLOYMENT_BLOCK,indexedThrough:next>DEPLOYMENT_BLOCK?next-1:null,indexedTime:this.get('indexedTime'),targetBlock:head,progress:head?Math.min(100,Math.max(0,(next-DEPLOYMENT_BLOCK)/(head-DEPLOYMENT_BLOCK+1)*100)):0,caughtUp:!!head&&next>head,events:total,paused:this.get('paused',false),running:!!lease&&lease.expires>Date.now(),error:this.get('error',''),updated:this.get('updated'),rpcHost:this.get('rpcHost'),storage:'Local SQLite',range:this.get('range',10000),source:this.get('source','Public RPC'),workers:this.get('workers',1),historyHost:this.get('historyHost',this.get('rpcHost')),storageBytes:this.storageBytes(),storageLimitBytes:this.get('storageLimitBytes',10*1024**3),speed:this.get('speed')};}
  saveSnapshot(address,data){this.db.prepare('INSERT INTO snapshots VALUES(?,?,?) ON CONFLICT(address) DO UPDATE SET time=excluded.time,data=excluded.data').run(address,Date.now(),stringify(data));}
  snapshot(address){const r=this.db.prepare('SELECT * FROM snapshots WHERE address=?').get(address);return r?{...JSON.parse(r.data),at:r.time}:null;}
  history(account,kind='all',page=0,through=this.get('next')-1){const filters={all:'1=1',trades:"name LIKE '%OrderFilled%'",pnl:"json_extract(args,'$.deltaPnlCNS') IS NOT NULL",flows:"name IN ('CollateralDeposit','CollateralWithdrawal')"};if(!Object.hasOwn(filters,kind))throw Error('Invalid history kind');const where='account=? AND block<=? AND '+filters[kind];const rows=this.db.prepare(`SELECT * FROM events WHERE ${where} ORDER BY block DESC,log_index DESC LIMIT 101 OFFSET ?`).all(account,through,page*100);return {rows:rows.slice(0,100).map(e=>({...e,args:JSON.parse(e.args)})),more:rows.length>100,page,kind,through};}
  walletStats(account){
    let delta=0n,funding=0n,fees=0n,deposits=0n,withdrawals=0n,wins=0,losses=0,flat=0,positive=0n,negative=0n,streak=0,best=0,worst=0,trades=0,liquidations=0;
    const byMarket={};const chart=[];
    for(const e of this.db.prepare('SELECT name,args,time,market FROM events WHERE account=? ORDER BY block,log_index').iterate(account)){
      const a=JSON.parse(e.args);
      if(e.name.includes('OrderFilled')){fees+=BigInt(a.feeCNS||0)+BigInt(a.builderFeeCNS||0);trades++;}
      if(e.name==='CollateralDeposit')deposits+=BigInt(a.amountCNS);
      if(e.name==='CollateralWithdrawal')withdrawals+=BigInt(a.amountCNS);
      if(e.name==='PositionLiquidated')liquidations++;
      if(a.deltaPnlCNS!=null){const v=BigInt(a.deltaPnlCNS)+BigInt(a.fundingCNS||0);delta+=BigInt(a.deltaPnlCNS);funding+=BigInt(a.fundingCNS||0);byMarket[e.market]=(byMarket[e.market]||0)+Number(v)/1e6;
        if(v>0){wins++;positive+=v;streak=Math.max(0,streak)+1;}else if(v<0){losses++;negative-=v;streak=Math.min(0,streak)-1;}else{flat++;streak=0;}best=Math.max(best,streak);worst=Math.min(worst,streak);
      }
      // Daily final cumulative exit PnL, explicitly before fees, not an equity curve.
      const t=Math.floor(e.time/86400000)*86400000,v=Number(delta+funding)/1e6;
      if(chart.at(-1)?.t===t)chart[chart.length-1]={t,v};else chart.push({t,v});
    }
    const ranked=Object.entries(byMarket).sort((a,b)=>b[1]-a[1]),exits=wins+losses+flat;
    return {delta:Number(delta)/1e6,funding:Number(funding)/1e6,grossPnl:Number(delta+funding)/1e6,fees:Number(fees)/1e6,deposits:Number(deposits)/1e6,withdrawals:Number(withdrawals)/1e6,trades,liquidations,exits,winRate:exits?wins/exits*100:null,profitFactor:negative?Number(positive)/Number(negative):positive?'Infinity':null,bestStreak:best,worstStreak:-worst,bestMarket:ranked[0]?.[0],worstMarket:ranked.at(-1)?.[0],chart};
  }
  protocol(){return protocolView(this);}
  close(){this.db.close();}
}
