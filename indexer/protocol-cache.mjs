import {DEPLOYMENT_BLOCK} from './chain.mjs';

// Build once per server session, then aggregate only newly committed blocks.
// A read transaction pins a consistent checkpoint while the worker keeps writing.
export function protocolView(store){
  const db=store.db;db.exec('BEGIN');
  try{
    const next=store.get('next'),revision=store.get('historyRevision',0);
    const old=store.protocolCache;
    const base=old&&old.next<=next&&old.revision===revision?old:{next:DEPLOYMENT_BLOCK,revision,deposits:0,withdrawals:0,fees:0,liquidations:0,accounts:new Set(),daily:new Map()};
    const counts=db.prepare(`SELECT
      SUM(CASE WHEN name='CollateralDeposit' THEN CAST(json_extract(args,'$.amountCNS') AS REAL)/1000000 ELSE 0 END) deposits,
      SUM(CASE WHEN name='CollateralWithdrawal' THEN CAST(json_extract(args,'$.amountCNS') AS REAL)/1000000 ELSE 0 END) withdrawals,
      SUM(CASE WHEN name LIKE '%OrderFilled%' THEN CAST(json_extract(args,'$.feeCNS') AS REAL)/1000000 ELSE 0 END) fees,
      json_group_array(DISTINCT CASE WHEN name LIKE '%OrderFilled%' THEN account END) accounts,
      SUM(CASE WHEN name='PositionLiquidated' THEN 1 ELSE 0 END) liquidations
      FROM events WHERE block>=? AND block<?`).get(base.next,next);
    const deltaDaily=db.prepare(`SELECT (time/86400000)*86400000 t,SUM(CASE WHEN name='CollateralDeposit' THEN CAST(json_extract(args,'$.amountCNS') AS REAL)/1000000 ELSE -CAST(json_extract(args,'$.amountCNS') AS REAL)/1000000 END) v FROM events WHERE block>=? AND block<? AND name IN ('CollateralDeposit','CollateralWithdrawal') GROUP BY t`).all(base.next,next);
    const accounts=new Set(base.accounts),daily=new Map(base.daily);
    for(const a of JSON.parse(counts.accounts||'[]'))if(a!==null)accounts.add(a);
    for(const d of deltaDaily)daily.set(d.t,(daily.get(d.t)||0)+d.v);
    const cache={next,revision,accounts,daily};for(const key of ['deposits','withdrawals','fees','liquidations'])cache[key]=base[key]+(counts[key]||0);
    const wallets=db.prepare("SELECT lower(json_extract(args,'$.account')) address,account FROM events WHERE name='AccountCreated' AND block<? ORDER BY block DESC LIMIT 8").all(next);
    const coverage=store.status();db.exec('COMMIT');store.protocolCache=cache;
    return {deposits:cache.deposits,withdrawals:cache.withdrawals,fees:cache.fees,liquidations:cache.liquidations,activeAccounts:accounts.size,daily:[...daily].sort((a,b)=>a[0]-b[0]).map(([t,v])=>({t,v})),accounts:wallets,coverage};
  }catch(e){db.exec('ROLLBACK');throw e;}
}
