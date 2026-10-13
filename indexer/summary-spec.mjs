import {readFileSync} from 'node:fs';
import {abi,eventNames} from './chain.mjs';
export const boundary=JSON.parse(readFileSync(new URL('./summary-boundary.json',import.meta.url)));
export const REFRESH_MS=5*60*1000;
export const amountFields=['amountCNS','feeCNS','builderFeeCNS','insFeeCNS','protFeeCNS'];
export const summaryNames=eventNames.filter(n=>['AccountCreated','CollateralDeposit','CollateralWithdrawal','PositionLiquidated'].includes(n)||n.includes('OrderFilled')||abi.getEvent(n).inputs.some(p=>p.name==='protFeeCNS'||p.name==='insFeeCNS'));
export function offsets(name){const f=abi.getEvent(name);if(f.inputs.some(p=>p.indexed))throw Error('Unexpected indexed event');return amountFields.map(k=>k==='amountCNS'&&!name.startsWith('Collateral')?0:Math.max(0,f.inputs.findIndex(p=>p.name===k)*32+1));}
export function summarize(rows){
 const daily=new Map(),accounts=new Map();
 for(const r of rows){
  const day=new Date(r.time).toISOString().slice(0,10);
  if(r.name.includes('OrderFilled')){if(!/^\d+$/.test(r.account))throw Error('Fill missing account');const key=day+':'+r.account;accounts.set(key,{day,account:r.account,fills:(accounts.get(key)?.fills||0)+1});}
  if(!summaryNames.includes(r.name))continue;
  const key=day+':'+r.name,d=daily.get(key)||{day,event:r.name,count:0,amounts:amountFields.map(()=>0n)};d.count++;
  amountFields.forEach((k,i)=>{if(i!==0||r.name.startsWith('Collateral'))d.amounts[i]+=BigInt(r.args[k]||0)});daily.set(key,d);
 }
 return {daily:[...daily.values()],accounts:[...accounts.values()]};
}
