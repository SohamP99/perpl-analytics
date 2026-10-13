import {boundary} from './summary-spec.mjs';
export function summaryView(rows,get,activity,activeAccounts){
  rows=[...rows].sort((a,b)=>a.day.localeCompare(b.day)||a.source.localeCompare(b.source)||a.event.localeCompare(b.event));
  const days=new Map();let deposits=0n,withdrawals=0n,fees=0n,builder=0n,insurance=0n,protocol=0n,liquidations=0,newAccounts=0;
  const empty=t=>({t,v:0,deposits:0,withdrawals:0,fees:0,builderFees:0,insuranceFees:0,protocolFees:0,liquidations:0,newUsers:0,makerFills:0,takerFills:0});
  for(const r of rows){const a=JSON.parse(r.amounts).map(BigInt);fees+=a[1];builder+=a[2];insurance+=a[3];protocol+=a[4];const d=days.get(r.day)||empty(Date.parse(r.day+'T00:00:00Z'));
   d.fees+=Number(a[1])/1e6;d.builderFees+=Number(a[2])/1e6;d.insuranceFees+=Number(a[3])/1e6;d.protocolFees+=Number(a[4])/1e6;
   if(r.event==='CollateralDeposit'){deposits+=a[0];d.deposits+=Number(a[0])/1e6;d.v+=Number(a[0])/1e6;}if(r.event==='CollateralWithdrawal'){withdrawals+=a[0];d.withdrawals+=Number(a[0])/1e6;d.v-=Number(a[0])/1e6;}
   if(r.event==='PositionLiquidated'){liquidations+=r.count;d.liquidations+=r.count;}if(r.event==='AccountCreated'){newAccounts+=r.count;d.newUsers+=r.count;}
   if(r.event.startsWith('MakerOrderFilled'))d.makerFills+=r.count;if(r.event.startsWith('TakerOrderFilled'))d.takerFills+=r.count;days.set(r.day,d);
  }
  const imported=get('imported'),history=!!imported;
  // Daily zeros are trustworthy only inside a completed Dune or RPC interval.
  const addDays=(start,end)=>{for(let t=start;t<=end;t+=86400000){const day=new Date(t).toISOString().slice(0,10);if(!days.has(day))days.set(day,empty(t));}};
  if(history)addDays(Date.parse('2026-02-01T00:00:00Z'),Date.parse(boundary.cutoff)-86400000);
  if(get('throughTime'))addDays(Date.parse(boundary.cutoff),Math.floor(get('throughTime')/86400000)*86400000);
  return {activity24h:activity([...days.values()]),deposits:Number(deposits)/1e6,withdrawals:Number(withdrawals)/1e6,fees:Number(fees)/1e6,builderFees:Number(builder)/1e6,insuranceFees:Number(insurance)/1e6,positionProtocolFees:Number(protocol)/1e6,liquidations,newAccounts,activeAccounts:history&&!get('activityImported')?null:activeAccounts,daily:[...days.values()].sort((a,b)=>a.t-b.t),coverage:{mode:'summaries',historicalImported:history,activityImported:!!get('activityImported'),cutoff:boundary.cutoff,fromBlock:boundary.fromBlock,newFromBlock:boundary.toBlockExclusive,nextBlock:get('next'),throughTime:get('throughTime'),lastRun:get('lastRun'),lastAttempt:get('lastAttempt'),retryAt:get('retryAt'),refreshIntervalMs:300000,nextRun:get('nextRun'),error:get('error',''),running:get('running',false),importedAt:imported?.at,source:'Dune CSV + periodic HyperSync/RPC'}};
}
