import {readFileSync,writeFileSync,renameSync,mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseCsvLine} from './dune-csv.mjs';
const bundled=fileURLToPath(new URL('../data/network-snapshot.json',import.meta.url));
export function readNetworkSnapshot(directory){
 const file=path.join(directory,'network-snapshot.json');
 return JSON.parse(readFileSync(existsSync(file)?file:bundled,'utf8'));
}
const number=(value,name)=>{if(value==null||String(value).trim()===''||!Number.isFinite(Number(value)))throw Error('Missing or invalid '+name);return Number(value)};
function time(value){const text=String(value).trim().replace(/ UTC$/,'Z').replace(' ','T');const t=Date.parse(/Z$|[+-]\d\d:\d\d$/.test(text)?text:text+'Z');if(!Number.isFinite(t))throw Error('Invalid UTC date');return t}
export function parseNetworkCsv(text){
 const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/),header=parseCsvLine(lines.shift());
 if(new Set(header).size!==header.length)throw Error('Duplicate columns');
 return lines.filter(Boolean).map(line=>{const cells=parseCsvLine(line);if(cells.length!==header.length)throw Error('Incomplete CSV row');return Object.fromEntries(header.map((h,i)=>[h,cells[i]]))});
}
function ordered(rows,interval){rows.sort((a,b)=>a.t-b.t);for(let i=0;i<rows.length;i++){if(rows[i].t%interval)throw Error('Date is not aligned to its UTC interval');if(i&&rows[i].t-rows[i-1].t!==interval)throw Error('Duplicate dates or missing intervals');}return rows}
export function applyNetworkCsv(snapshot,text,{capturedAt=new Date().toISOString()}={}){
 const rows=parseNetworkCsv(text);if(!rows.length)throw Error('Empty CSV');const next=structuredClone(snapshot),first=rows[0];
 if('avg_tps_24h' in first){if(rows.length!==1)throw Error('Expected one TPS result');const value=number(first.avg_tps_24h,'TPS');if(value<0)throw Error('Negative TPS');next.tps={value,capturedAt,source:'https://dune.com/queries/8757054/12785303',window:'rolling 24 hours at query execution',executionAt:null};}
 else if('hour' in first&&'transactions' in first){
  const data=ordered(rows.map(r=>{const transactions=number(r.transactions,'transactions');if(!Number.isSafeInteger(transactions)||transactions<0)throw Error('Invalid transaction count');return {t:time(r.hour),transactions}}),3600000);
  if(data.length!==24)throw Error('Expected 24 complete hourly rows');next.hourly={data,capturedAt,from:data[0].t,to:data.at(-1).t+3600000,source:'https://dune.com/queries/8757055/12785312'};
 }else if('day' in first&&'gross_emissions_mon' in first){
  const data=ordered(rows.map(r=>{const t=time(r.day),gross=number(r.gross_emissions_mon,'gross emissions'),burned=number(r.total_burned_mon,'total burn'),perpl=number(r.perpl_burned_mon,'Perpl burn'),net=number(r.net_emissions_mon,'net emissions'),rest=number(r.rest_of_monad_burned_mon,'other burn');
   if(gross<0||burned<0||perpl<0||perpl>burned+1e-5||Math.abs(net-(gross-burned))>1e-5||Math.abs(rest-(burned-perpl))>1e-5)throw Error('Emission/burn totals do not reconcile');
   return {t,gross,burned,perpl,net,rest};
  }),86400000).filter(r=>r.t>=Date.UTC(2026,1,1));
  if(!data.length)throw Error('No February 2026 onward rows');next.emissions={data,capturedAt,source:'https://dune.com/queries/8757057/12785379',through:data.at(-1).t+86400000};
 }else throw Error('Unrecognized Dune summary columns');return next;
}
export function saveNetworkSnapshot(directory,snapshot){mkdirSync(directory,{recursive:true});const target=path.join(directory,'network-snapshot.json'),tmp=target+'.tmp';writeFileSync(tmp,JSON.stringify(snapshot,null,2)+'\n');renameSync(tmp,target);}
