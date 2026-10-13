import {Rpc,EXCHANGE,topics,hex,decodeLogs} from './chain.mjs';

// Fetch disjoint future ranges concurrently, but expose only completed prefixes.
// No second database writer or independent checkpoint can skip a missing range.
export function planRanges(start,head,workers=3){
  const ranges=[];let next=start;
  for(let i=0;i<workers&&next<=head;i++){
    const source=i===2?'RPC':'HyperSync',end=Math.min(head,next+(source==='RPC'?500:5000)-1);
    ranges.push({start:next,end,source});next=end+1;
  }
  return ranges;
}
export async function orderedRanges(ranges,fetchRange){
  const results=await Promise.allSettled(ranges.map(r=>fetchRange(r)));
  return results.map((r,i)=>({...r,range:ranges[i]}));
}
export class ParallelBackfill {
  constructor(hypersync,url,workers=3){this.hypersync=hypersync;this.url=url;this.workers=workers;}
  async fetch(start,head){return orderedRanges(planRanges(start,head,this.workers),range=>this.range(range));}
  async range({start,end,source}){
    const rpc=new Rpc(this.url,150,{timeoutMs:8000,attempts:2}),rows=[];let next=start,lastArchive=null;
    while(next<=end){
      if(source==='HyperSync'){
        if(this.hypersync.readyAt>Date.now()){const e=Error('HyperSync rate limit; parallel requests cooling down.');e.retryMs=this.hypersync.readyAt-Date.now();throw e;}
        const page=await this.hypersync.page(next,end);
        rows.push(...page.rows);next=page.next;
        for(const [number,b] of page.blocks)if(!lastArchive||number>lastArchive.number)lastArchive={number,hash:b.hash};
      }else{
        let span=Math.min(250,end-next+1),logs;
        for(;;){
          try{logs=await rpc.call('eth_getLogs',[{address:EXCHANGE,topics:[topics],fromBlock:hex(next),toBlock:hex(next+span-1)}]);}
          catch(e){if(span>1&&/range|too many results|limit exceeded|response.*large/i.test(e.message)){span=Math.max(1,Math.floor(span/2));continue;}throw e;}
          if(!Array.isArray(logs))throw Error('Invalid RPC log response');
          if(logs.length>=10000){if(span===1)throw Error('RPC single-block safety cap; checkpoint retained');span=Math.max(1,Math.floor(span/2));continue;}
          break;
        }
        const times=new Map();for(const log of logs){const n=Number(BigInt(log.blockNumber));if(n<next||n>=next+span)throw Error('RPC log outside requested range');if(!log.blockTimestamp&&!times.has(n))times.set(n,Number(BigInt((await rpc.block(n)).timestamp))*1000);}
        rows.push(...decodeLogs(logs,times));next+=span;
        for(const log of logs){const n=Number(BigInt(log.blockNumber));if(!lastArchive||n>lastArchive.number)lastArchive={number:n,hash:log.blockHash};}
      }
      if(rows.length>200000)throw Error('Parallel range memory limit reached; use PERPL_BACKFILL_WORKERS=1 for this dense range.');
    }
    const first=await rpc.block(start),last=start===end?first:await rpc.block(end);
    if(lastArchive){const actual=lastArchive.number===end?last:lastArchive.number===start?first:await rpc.block(lastArchive.number);if(actual.hash!==lastArchive.hash)throw Error('Parallel source/RPC hash mismatch; checkpoint retained');}
    return {start,end,hash:last.hash,time:Number(BigInt(last.timestamp))*1000,firstParentHash:first.parentHash,rows,source};
  }
}
