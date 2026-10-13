import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import {abi,topics,EXCHANGE,hex} from './chain.mjs';
const fields=['block_number','block_timestamp','block_hash','transaction_hash','log_index','address','topic0','topic1','topic2','topic3','data','event_name'];
const names=new Map(topics.map(t=>[t,abi.getEvent(t).name]));
export function parseCsvLine(line){
  const cells=[];let value='',quoted=false,closed=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(quoted){if(c==='"'){if(line[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else value+=c;}
    else if(c===','){cells.push(value);value='';closed=false;}
    else if(c==='"'&&!value&&!closed)quoted=true;
    else{if(closed||c==='"')throw Error('Malformed CSV quoting');value+=c;}
  }
  if(quoted)throw Error('Multiline or incomplete CSV field; raw hex exports must be single-line');
  cells.push(value);return cells;
}
const integer=(value,name)=>{if(!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value)))throw Error('Invalid Dune '+name);return Number(value);};
export function normalizeDune(row){
  const n=integer(row.block_number,'block'),timestamp=integer(row.block_timestamp,'timestamp'),index=integer(row.log_index,'log index');
  for(const field of ['block_hash','transaction_hash','topic0'])if(!/^0x[0-9a-f]{64}$/i.test(row[field]))throw Error('Invalid Dune '+field);
  if(row.address?.toLowerCase()!==EXCHANGE)throw Error('Unexpected Dune contract');
  if(!/^0x(?:[0-9a-f]{2})*$/i.test(row.data))throw Error('Invalid Dune event data');
  const ts=[row.topic0.toLowerCase()];let ended=false;
  for(const key of ['topic1','topic2','topic3']){
    if(!row[key]||row[key].toLowerCase()==='null'){ended=true;continue;}
    if(ended||!/^0x[0-9a-f]{64}$/i.test(row[key]))throw Error('Invalid Dune topic sequence');ts.push(row[key].toLowerCase());
  }
  if(names.get(ts[0])!==row.event_name)throw Error('Dune event name/topic mismatch');
  return {address:EXCHANGE,blockNumber:hex(n),blockTimestamp:hex(timestamp),blockHash:row.block_hash.toLowerCase(),transactionHash:row.transaction_hash.toLowerCase(),logIndex:hex(index),topics:ts,data:row.data.toLowerCase(),removed:false};
}
export async function* duneBlocks(file,{from,to}){
  const lines=createInterface({input:createReadStream(file,{encoding:'utf8'}),crlfDelay:Infinity});
  let header=null,group=[],block=-1,index=-1;
  for await(const raw of lines){
    const line=header?raw:raw.replace(/^\uFEFF/,'');
    if(!header){header=parseCsvLine(line);if(header.length!==fields.length||new Set(header).size!==fields.length||fields.some(f=>!header.includes(f)))throw Error('Unexpected Dune CSV columns');continue;}
    if(!line)continue;
    const cells=parseCsvLine(line);if(cells.length!==header.length)throw Error('Incomplete Dune CSV row');
    const row=Object.fromEntries(header.map((f,i)=>[f,cells[i]])),log=normalizeDune(row),n=Number(BigInt(log.blockNumber)),i=Number(BigInt(log.logIndex));
    if(n<from||n>=to)throw Error('Dune row outside declared export interval');
    if(n<block||n===block&&i<=index)throw Error('Dune CSV is unordered or has duplicate log indices');
    if(n!==block&&group.length){yield group;group=[];}
    if(group.length&&(group[0].blockHash!==log.blockHash||group[0].blockTimestamp!==log.blockTimestamp))throw Error('Inconsistent Dune block hash/time');
    group.push(log);block=n;index=i;
  }
  if(!header)throw Error('Empty CSV file');if(group.length)yield group;
}
