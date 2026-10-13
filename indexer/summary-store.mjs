import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {boundary,summarize} from './summary-spec.mjs';
function observation(data){
 if(!Array.isArray(data.markets))return data;
 const point={oi:0,tvl:0};
 for(const m of data.markets){const token=data.tokens?.find(t=>t.id===data.instances?.find(i=>i.id===m.instance_id)?.collateral_token_id),scale=10**(token?.decimals??6),s=m.state||{};
  if(s.oi==null||s.mrk==null)point.oi=null;else if(point.oi!==null)point.oi+=Number(s.oi)/10**m.config.size_decimals*Number(s.mrk)/10**m.config.price_decimals;
  if(s.tvl==null)point.tvl=null;else if(point.tvl!==null)point.tvl+=Number(s.tvl)/scale;
  point['m'+m.id]=m.funding?.rate==null?null:m.funding.rate/10000;
 }return point;
}
export class SummaryStore {
 constructor(file){mkdirSync(path.dirname(file),{recursive:true});this.db=new DatabaseSync(file);this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=10000;
 CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS daily(source TEXT,day TEXT,event TEXT,count INTEGER,amounts TEXT,PRIMARY KEY(source,day,event));
 CREATE TABLE IF NOT EXISTS accounts(source TEXT,day TEXT,account TEXT,fills INTEGER,PRIMARY KEY(source,day,account));
 CREATE TABLE IF NOT EXISTS api_cache(path TEXT PRIMARY KEY,data TEXT,time INTEGER);
 CREATE TABLE IF NOT EXISTS liquidation_details(id TEXT PRIMARY KEY,block INTEGER,time INTEGER,tx TEXT,account TEXT,market TEXT,args TEXT);
 CREATE TABLE IF NOT EXISTS account_addresses(account TEXT PRIMARY KEY,address TEXT);
 CREATE TABLE IF NOT EXISTS market_observations(time INTEGER PRIMARY KEY,data TEXT);
 CREATE TABLE IF NOT EXISTS recent_flows(minute INTEGER PRIMARY KEY,deposits TEXT,withdrawals TEXT);
 CREATE TABLE IF NOT EXISTS recent_accounts(minute INTEGER,account TEXT,PRIMARY KEY(minute,account));
 CREATE TABLE IF NOT EXISTS recent_trading_transactions(tx TEXT PRIMARY KEY,time INTEGER);
 CREATE INDEX IF NOT EXISTS recent_transaction_time ON recent_trading_transactions(time);
 CREATE TABLE IF NOT EXISTS lease(id INTEGER PRIMARY KEY,owner TEXT,expires INTEGER);`);
 if(this.get('next')===null){this.set('next',boundary.toBlockExclusive);this.set('hash',boundary.parentHash);}
 const saved=this.cache('/v1/pub/context');if(saved?.data?.markets&&!this.db.prepare('SELECT 1 FROM market_observations LIMIT 1').get())this.db.prepare('INSERT OR IGNORE INTO market_observations VALUES(?,?)').run(saved.at,JSON.stringify(saved.data));
 }
 get(k,f=null){const v=this.db.prepare('SELECT value FROM settings WHERE key=?').get(k);return v?JSON.parse(v.value):f;}
 set(k,v){this.db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run(k,JSON.stringify(v));}
 acquire(owner){this.db.prepare('INSERT INTO lease VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires=excluded.expires WHERE lease.expires<? OR lease.owner=?').run(owner,Date.now()+120000,Date.now(),owner);return this.db.prepare('SELECT owner FROM lease WHERE id=1').get()?.owner===owner;}
 release(owner){this.db.prepare('DELETE FROM lease WHERE owner=?').run(owner);}
 commit(batch){
  const {start,end,hash,firstParentHash,time,rows}=batch;
  if(start!==this.get('next')||firstParentHash!==this.get('hash'))throw Error('Summary continuity mismatch; checkpoint retained');
  if(!Number.isSafeInteger(end)||end<start||!/^0x[0-9a-f]{64}$/i.test(hash)||!Number.isFinite(time))throw Error('Invalid summary batch');
  for(const r of rows)if(r.block<start||r.block>end||r.time<Date.parse(boundary.cutoff))throw Error('Summary event outside new-data interval');
  const sum=summarize(rows);this.db.exec('BEGIN IMMEDIATE');
  try{
   if(start!==this.get('next')||firstParentHash!==this.get('hash'))throw Error('Summary checkpoint changed');
   for(const r of sum.daily){const old=this.db.prepare("SELECT * FROM daily WHERE source='rpc' AND day=? AND event=?").get(r.day,r.event);const amounts=r.amounts.map((v,i)=>(v+BigInt(old?JSON.parse(old.amounts)[i]:0)).toString());this.db.prepare('INSERT OR REPLACE INTO daily VALUES(?,?,?,?,?)').run('rpc',r.day,r.event,r.count+(old?.count||0),JSON.stringify(amounts));}
   for(const r of sum.accounts)this.db.prepare("INSERT INTO accounts VALUES('rpc',?,?,?) ON CONFLICT(source,day,account) DO UPDATE SET fills=fills+excluded.fills").run(r.day,r.account,r.fills);
   this.saveDetails(rows);this.saveRecent(rows,this.get('throughTime')||Date.parse(boundary.cutoff),time,start,end);
   this.set('next',end+1);this.set('hash',hash);this.set('throughTime',time);this.set('error','');this.db.exec('COMMIT');
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 cache(key){const r=this.db.prepare('SELECT * FROM api_cache WHERE path=?').get(key);return r?{data:JSON.parse(r.data),at:r.time}:null;}
 saveCache(key,data){const now=Date.now();this.db.prepare('INSERT OR REPLACE INTO api_cache VALUES(?,?,?)').run(key,JSON.stringify(data),now);
  if(key==='/v1/pub/context'&&Array.isArray(data.markets))this.db.prepare('INSERT OR REPLACE INTO market_observations VALUES(?,?)').run(now,JSON.stringify(observation(data)));
 }
 saveDetails(rows){for(const r of rows){const a=typeof r.args==='string'?JSON.parse(r.args):r.args;
  if(r.name==='PositionLiquidated')this.db.prepare('INSERT OR IGNORE INTO liquidation_details VALUES(?,?,?,?,?,?,?)').run(r.id,r.block,r.time,r.tx,r.account,r.market,JSON.stringify(a));
  if(r.name==='AccountCreated'&&/^0x[a-f0-9]{40}$/i.test(a.account))this.db.prepare('INSERT OR IGNORE INTO account_addresses VALUES(?,?)').run(String(a.id),a.account.toLowerCase());
 }}
 importSavedDetails(old){if(this.get('detailsImportedThrough')===old.get('next'))return;const rows=old.db.prepare("SELECT * FROM events WHERE name IN ('PositionLiquidated','AccountCreated') AND block<?").all(old.get('next'));
  this.db.exec('BEGIN IMMEDIATE');try{this.saveDetails(rows);this.set('detailsImportedThrough',old.get('next'));this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 liquidations(){return this.db.prepare('SELECT l.*,a.address FROM liquidation_details l LEFT JOIN account_addresses a ON a.account=l.account ORDER BY l.time DESC,l.id DESC').all().map(r=>({...r,args:JSON.parse(r.args)}));}
 observations(){return this.db.prepare('SELECT * FROM market_observations ORDER BY time').all().map(r=>({t:r.time,...observation(JSON.parse(r.data))}));}
 saveRecent(rows,previousTime,time,start,end){
  // Track exact minute-aligned windows from a verified continuous checkpoint.
  if(this.get('recentFrom')===null||this.get('recentNext')!==start)this.set('recentFrom',Math.ceil(previousTime/60000)*60000);
  this.set('recentNext',end+1);
  const flows=new Map();
  for(const r of rows){const minute=Math.floor(r.time/60000)*60000;
   if(r.name.includes('OrderFilled')){
    this.db.prepare('INSERT OR IGNORE INTO recent_accounts VALUES(?,?)').run(minute,r.account);
    this.db.prepare('INSERT OR IGNORE INTO recent_trading_transactions VALUES(?,?)').run(r.tx,r.time);
   }
   if(r.name==='CollateralDeposit'||r.name==='CollateralWithdrawal'){const f=flows.get(minute)||{deposits:0n,withdrawals:0n};f[r.name==='CollateralDeposit'?'deposits':'withdrawals']+=BigInt(r.args.amountCNS||0);flows.set(minute,f);}
  }
  for(const [minute,f] of flows){const old=this.db.prepare('SELECT * FROM recent_flows WHERE minute=?').get(minute);this.db.prepare('INSERT OR REPLACE INTO recent_flows VALUES(?,?,?)').run(minute,(f.deposits+BigInt(old?.deposits||0)).toString(),(f.withdrawals+BigInt(old?.withdrawals||0)).toString());}
  const prune=time-2*86400000;this.db.prepare('DELETE FROM recent_flows WHERE minute<?').run(prune);this.db.prepare('DELETE FROM recent_accounts WHERE minute<?').run(prune);this.db.prepare('DELETE FROM recent_trading_transactions WHERE time<?').run(prune);
 }
 activity24h(days){
  const end=Math.floor((this.get('throughTime')||0)/60000)*60000,start=end-86400000,recentFrom=this.get('recentFrom');
  if(recentFrom!==null&&recentFrom<=start&&this.get('recentNext')===this.get('next')){let deposits=0n,withdrawals=0n;for(const f of this.db.prepare('SELECT * FROM recent_flows WHERE minute>=? AND minute<?').all(start,end)){deposits+=BigInt(f.deposits);withdrawals+=BigInt(f.withdrawals);}
   return {mode:'rolling',from:start,to:end,activeUsers:this.db.prepare('SELECT COUNT(DISTINCT account) n FROM recent_accounts WHERE minute>=? AND minute<?').get(start,end).n,deposits:Number(deposits)/1e6,withdrawals:Number(withdrawals)/1e6,tps:this.db.prepare('SELECT COUNT(*) n FROM recent_trading_transactions WHERE time>=? AND time<?').get(start,end).n/86400};
  }
  // Imported account-day aggregates cannot be sliced into a rolling window or TPS.
  const through=Math.max(this.get('imported')?Date.parse(boundary.cutoff):0,this.get('throughTime')||0),to=Math.floor(through/86400000)*86400000,from=to-86400000;
  const d=days.find(d=>d.t===from);if(!d)return null;
  return {mode:'utc-day',from,to,deposits:d.deposits,withdrawals:d.withdrawals,makerFills:d.makerFills,tps:null,activeUsers:this.get('activityImported')||from>=Date.parse(boundary.cutoff)?this.db.prepare('SELECT COUNT(DISTINCT account) n FROM accounts WHERE day=?').get(new Date(from).toISOString().slice(0,10)).n:null};
 }
 view(){
  const rows=this.db.prepare('SELECT * FROM daily ORDER BY day').all(),days=new Map();let deposits=0n,withdrawals=0n,fees=0n,builder=0n,insurance=0n,protocol=0n,liquidations=0,newAccounts=0;
  const empty=t=>({t,v:0,deposits:0,withdrawals:0,fees:0,builderFees:0,insuranceFees:0,protocolFees:0,liquidations:0,newUsers:0,makerFills:0,takerFills:0});
  for(const r of rows){const a=JSON.parse(r.amounts).map(BigInt);fees+=a[1];builder+=a[2];insurance+=a[3];protocol+=a[4];const d=days.get(r.day)||empty(Date.parse(r.day+'T00:00:00Z'));
   d.fees+=Number(a[1])/1e6;d.builderFees+=Number(a[2])/1e6;d.insuranceFees+=Number(a[3])/1e6;d.protocolFees+=Number(a[4])/1e6;
   if(r.event==='CollateralDeposit'){deposits+=a[0];d.deposits+=Number(a[0])/1e6;d.v+=Number(a[0])/1e6;}if(r.event==='CollateralWithdrawal'){withdrawals+=a[0];d.withdrawals+=Number(a[0])/1e6;d.v-=Number(a[0])/1e6;}
   if(r.event==='PositionLiquidated'){liquidations+=r.count;d.liquidations+=r.count;}if(r.event==='AccountCreated'){newAccounts+=r.count;d.newUsers+=r.count;}
   if(r.event.startsWith('MakerOrderFilled'))d.makerFills+=r.count;if(r.event.startsWith('TakerOrderFilled'))d.takerFills+=r.count;days.set(r.day,d);
  }
  const imported=this.get('imported'),history=!!imported;
  // Daily zeros are trustworthy only inside a completed Dune or RPC interval.
  const addDays=(start,end)=>{for(let t=start;t<=end;t+=86400000){const day=new Date(t).toISOString().slice(0,10);if(!days.has(day))days.set(day,empty(t));}};
  if(history)addDays(Date.parse('2026-02-01T00:00:00Z'),Date.parse(boundary.cutoff)-86400000);
  if(this.get('throughTime'))addDays(Date.parse(boundary.cutoff),Math.floor(this.get('throughTime')/86400000)*86400000);
  return {activity24h:this.activity24h([...days.values()]),deposits:Number(deposits)/1e6,withdrawals:Number(withdrawals)/1e6,fees:Number(fees)/1e6,builderFees:Number(builder)/1e6,insuranceFees:Number(insurance)/1e6,positionProtocolFees:Number(protocol)/1e6,liquidations,newAccounts,activeAccounts:history&&!this.get('activityImported')?null:this.db.prepare('SELECT COUNT(DISTINCT account) n FROM accounts').get().n,daily:[...days.values()].sort((a,b)=>a.t-b.t),coverage:{mode:'summaries',historicalImported:history,activityImported:!!this.get('activityImported'),cutoff:boundary.cutoff,fromBlock:boundary.fromBlock,newFromBlock:boundary.toBlockExclusive,nextBlock:this.get('next'),throughTime:this.get('throughTime'),lastRun:this.get('lastRun'),lastAttempt:this.get('lastAttempt'),retryAt:this.get('retryAt'),refreshIntervalMs:300000,nextRun:this.get('nextRun'),error:this.get('error',''),running:this.get('running',false),importedAt:imported?.at,source:'Dune CSV + periodic HyperSync/RPC'}};
 }
 close(){this.db.close();}
}
