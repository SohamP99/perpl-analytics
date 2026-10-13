import {readFileSync} from 'node:fs';
import {boundary,summarize} from '../indexer/summary-spec.mjs';
import {summaryView} from '../indexer/summary-view.mjs';
const json=v=>JSON.stringify(v,(_,n)=>typeof n==='bigint'?n.toString():n);
const clock="(extract(epoch from clock_timestamp())*1000)::bigint";
export class PostgresStore {
 constructor(pool){this.pool=pool;}
 async init(){await this.transaction(async db=>{await db.query('SELECT pg_advisory_xact_lock(143,202602)');await db.query(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));await db.query('INSERT INTO settings VALUES ($1,$2),($3,$4) ON CONFLICT DO NOTHING',['next',json(boundary.toBlockExclusive),'hash',json(boundary.parentHash)]);});}
 async get(key,fallback=null,db=this.pool){const r=await db.query('SELECT value FROM settings WHERE key=$1',[key]);return r.rows.length?r.rows[0].value:fallback;}
 async set(key,value,db=this.pool){await db.query('INSERT INTO settings VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value',[key,json(value)]);}
 async transaction(fn,{readOnly=false}={}){const db=await this.pool.connect();try{await db.query(readOnly?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');await db.query("SET LOCAL statement_timeout='4000ms'");const result=await fn(db);await db.query('COMMIT');return result;}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}}
 async acquire(owner){const r=await this.pool.query(`INSERT INTO lease VALUES(1,$1,${clock}+60000) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires=excluded.expires WHERE lease.expires<${clock} OR lease.owner=$1 RETURNING owner`,[owner]);return r.rows.length===1;}
 async release(owner){await this.pool.query('DELETE FROM lease WHERE owner=$1',[owner]);}
 async cache(path){const r=(await this.pool.query('SELECT data,time FROM api_cache WHERE path=$1',[path])).rows[0];return r?{data:r.data,at:Number(r.time)}:null;}
 async saveCache(path,data){await this.pool.query('INSERT INTO api_cache VALUES($1,$2,$3) ON CONFLICT(path) DO UPDATE SET data=excluded.data,time=excluded.time',[path,json(data),Date.now()]);}
 async distinctLiquidationMarkets(){return (await this.pool.query('SELECT DISTINCT market FROM liquidation_details')).rows.map(r=>r.market);}
 async liquidations(){return (await this.pool.query('SELECT l.*,a.address FROM liquidation_details l LEFT JOIN account_addresses a ON a.account=l.account ORDER BY l.time DESC,l.id DESC')).rows.map(r=>({...r,time:Number(r.time),block:Number(r.block)}));}
 async commit(batch,owner){
  const {start,end,hash,firstParentHash,time,rows}=batch;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end<start||!/^0x[0-9a-f]{64}$/i.test(hash)||!Number.isFinite(time))throw Error('Invalid summary batch');
  const ids=new Set();for(const r of rows){if(r.block<start||r.block>end||r.time<Date.parse(boundary.cutoff)||r.time>time||!r.id||ids.has(r.id))throw Error('Invalid or duplicate batch event');ids.add(r.id);}
  const sum=summarize(rows);
  await this.transaction(async db=>{
   const lease=await db.query(`SELECT owner FROM lease WHERE id=1 AND owner=$1 AND expires>${clock} FOR UPDATE`,[owner]);if(!lease.rows.length)throw Error('Writer lease lost');
   await db.query("SELECT value FROM settings WHERE key='next' FOR UPDATE");
   if(start!==await this.get('next',null,db)||firstParentHash!==await this.get('hash',null,db))throw Error('Summary continuity mismatch; checkpoint retained');
   const previousTime=await this.get('throughTime',Date.parse(boundary.cutoff),db);
   if(time<previousTime)throw Error('Batch timestamp precedes checkpoint');
   await db.query(`INSERT INTO daily SELECT 'rpc',day,event,count,amounts FROM jsonb_to_recordset($1::jsonb) AS r(day text,event text,count bigint,amounts jsonb)
    ON CONFLICT(source,day,event) DO UPDATE SET count=daily.count+excluded.count,amounts=jsonb_build_array(
    ((daily.amounts->>0)::numeric+(excluded.amounts->>0)::numeric)::text,((daily.amounts->>1)::numeric+(excluded.amounts->>1)::numeric)::text,
    ((daily.amounts->>2)::numeric+(excluded.amounts->>2)::numeric)::text,((daily.amounts->>3)::numeric+(excluded.amounts->>3)::numeric)::text,((daily.amounts->>4)::numeric+(excluded.amounts->>4)::numeric)::text)`,[json(sum.daily)]);
   await db.query(`INSERT INTO accounts SELECT 'rpc',day,account,fills FROM jsonb_to_recordset($1::jsonb) AS r(day text,account text,fills bigint) ON CONFLICT(source,day,account) DO UPDATE SET fills=accounts.fills+excluded.fills`,[json(sum.accounts)]);
   const liquidations=rows.filter(r=>r.name==='PositionLiquidated');
   await db.query(`INSERT INTO liquidation_details SELECT id,block,time,tx,account,market,args FROM jsonb_to_recordset($1::jsonb) AS r(id text,block bigint,time bigint,tx text,account text,market text,args jsonb) ON CONFLICT DO NOTHING`,[json(liquidations)]);
   const addresses=rows.filter(r=>r.name==='AccountCreated'&&/^0x[a-f0-9]{40}$/i.test(r.args.account)).map(r=>({account:String(r.args.id),address:r.args.account.toLowerCase()}));
   await db.query(`INSERT INTO account_addresses SELECT account,address FROM jsonb_to_recordset($1::jsonb) AS r(account text,address text) ON CONFLICT DO NOTHING`,[json(addresses)]);
   if(await this.get('recentFrom',null,db)===null||await this.get('recentNext',null,db)!==start)await this.set('recentFrom',Math.ceil(previousTime/60000)*60000,db);
   const flows=new Map(),active=new Map(),transactions=new Map();
   for(const r of rows){const minute=Math.floor(r.time/60000)*60000;if(r.name.includes('OrderFilled')){active.set(minute+':'+r.account,{minute,account:r.account});transactions.set(r.tx,{tx:r.tx,time:r.time});}
    if(r.name==='CollateralDeposit'||r.name==='CollateralWithdrawal'){const f=flows.get(minute)||{minute,deposits:0n,withdrawals:0n};f[r.name==='CollateralDeposit'?'deposits':'withdrawals']+=BigInt(r.args.amountCNS||0);flows.set(minute,f);}}
   await db.query(`INSERT INTO recent_flows SELECT minute,deposits,withdrawals FROM jsonb_to_recordset($1::jsonb) AS r(minute bigint,deposits numeric,withdrawals numeric) ON CONFLICT(minute) DO UPDATE SET deposits=recent_flows.deposits+excluded.deposits,withdrawals=recent_flows.withdrawals+excluded.withdrawals`,[json([...flows.values()])]);
   await db.query(`INSERT INTO recent_accounts SELECT minute,account FROM jsonb_to_recordset($1::jsonb) AS r(minute bigint,account text) ON CONFLICT DO NOTHING`,[json([...active.values()])]);
   await db.query(`INSERT INTO recent_trading_transactions SELECT tx,time FROM jsonb_to_recordset($1::jsonb) AS r(tx text,time bigint) ON CONFLICT DO NOTHING`,[json([...transactions.values()])]);
   const prune=time-2*86400000;await db.query('DELETE FROM recent_flows WHERE minute<$1',[prune]);await db.query('DELETE FROM recent_accounts WHERE minute<$1',[prune]);await db.query('DELETE FROM recent_trading_transactions WHERE time<$1',[prune]);
   for(const [k,v] of Object.entries({next:end+1,hash,throughTime:time,recentNext:end+1,error:''}))await this.set(k,v,db);
  });
 }
 async view(){return this.transaction(async db=>{
  const settings=new Map((await db.query('SELECT * FROM settings')).rows.map(r=>[r.key,r.value]));const get=(k,f=null)=>settings.has(k)?settings.get(k):f;
  const rows=(await db.query('SELECT * FROM daily ORDER BY day')).rows.map(r=>({...r,count:Number(r.count),amounts:json(r.amounts)}));
  const active=Number((await db.query('SELECT COUNT(DISTINCT account) n FROM accounts')).rows[0].n);
  const through=get('throughTime')||0,end=Math.floor(through/60000)*60000,start=end-86400000;
  let activity;
  if(get('recentFrom')!==null&&get('recentFrom')<=start&&get('recentNext')===get('next')){
   const flow=(await db.query('SELECT COALESCE(SUM(deposits),0)::text deposits,COALESCE(SUM(withdrawals),0)::text withdrawals FROM recent_flows WHERE minute>=$1 AND minute<$2',[start,end])).rows[0];
   const users=Number((await db.query('SELECT COUNT(DISTINCT account) n FROM recent_accounts WHERE minute>=$1 AND minute<$2',[start,end])).rows[0].n);
   activity={mode:'rolling',from:start,to:end,activeUsers:users,deposits:Number(flow.deposits)/1e6,withdrawals:Number(flow.withdrawals)/1e6,tps:null};
  }else{
   const to=Math.floor(Math.max(get('imported')?Date.parse(boundary.cutoff):0,through)/86400000)*86400000,from=to-86400000;
   const users=get('activityImported')||from>=Date.parse(boundary.cutoff)?Number((await db.query('SELECT COUNT(DISTINCT account) n FROM accounts WHERE day=$1',[new Date(from).toISOString().slice(0,10)])).rows[0].n):null;
   activity=days=>{const d=days.find(d=>d.t===from);return d?{mode:'utc-day',from,to,deposits:d.deposits,withdrawals:d.withdrawals,makerFills:d.makerFills,tps:null,activeUsers:users}:null;};
  }
  const result=summaryView(rows,get,typeof activity==='function'?activity:()=>activity,active);
  const lease=(await db.query(`SELECT 1 FROM lease WHERE expires>${clock}`)).rows.length>0;result.coverage.running=lease;return result;
 },{readOnly:true});}
 async maintenance(){await this.pool.query('DELETE FROM api_cache WHERE time<$1',[Date.now()-2*86400000]);const r=await this.pool.query('SELECT pg_database_size(current_database())::text bytes');return Number(r.rows[0].bytes);}
 async close(){await this.pool.end();}
}
