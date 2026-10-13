import {EXCHANGE,DEPLOYMENT_BLOCK,topics,storedTopics,hex,decodeLogs} from './chain.mjs';

export const HYPERSYNC_URL='https://monad.hypersync.xyz';
const knownTopics=new Set(topics);
export function hyperSyncRetryMs(headers,now=Date.now()){
 const after=headers.get('retry-after'),reset=headers.get('x-ratelimit-reset');let ms=60000;
 if(after!=null){ms=/^\d+(\.\d+)?$/.test(after)?Number(after)*1000:Date.parse(after)-now;}
 else if(reset!=null){const n=Number(reset);ms=n>1e12?n-now:n>1e9?n*1000-now:n*1000;}
 return Math.max(1000,Number.isFinite(ms)?ms:60000);
}
export function historyQuery(start,end){
  if(!Number.isSafeInteger(start)||start<DEPLOYMENT_BLOCK||!Number.isSafeInteger(end)||end<start)throw Error('Invalid history range');
  return {from_block:start,to_block:end+1,
    logs:[{address:[EXCHANGE],topics:[storedTopics]}],
    // Join only matching transactions, bringing along the OrderRequest context
    // needed by taker fills. Pure order/cancel transactions are never selected.
    join_mode:'JoinAll',max_num_logs:5000,
    field_selection:{block:['number','hash','parent_hash','timestamp'],log:['address','block_number','block_hash','transaction_hash','log_index','data','topic0','topic1','topic2','topic3']}};
}
export function parsePage(result,start,end){
  const next=result.next_block;
  if(!Number.isSafeInteger(next)||next<=start||next>end+1)throw Error('Invalid HyperSync cursor; checkpoint retained');
  const parts=Array.isArray(result.data)?result.data:[result.data];
  const logs=[],blocks=new Map(),times=new Map();
  for(const part of parts){
    if(!part||!Array.isArray(part.logs)||!Array.isArray(part.blocks))throw Error('Incomplete HyperSync page');
    for(const b of part.blocks.flat()){
      const n=Number(b.number),seconds=Number(b.timestamp);
      if(!Number.isSafeInteger(n)||!Number.isFinite(seconds)||!/^0x[0-9a-f]{64}$/i.test(b.hash))throw Error('Invalid HyperSync block');
      blocks.set(n,b);times.set(n,seconds*1000);
    }
    for(const l of part.logs.flat()){
      // JoinAll may include logs from other contracts in the same transaction.
      if(l.address?.toLowerCase()!==EXCHANGE||!knownTopics.has(l.topic0))continue;
      const n=Number(l.block_number),index=Number(l.log_index),b=blocks.get(n);
      if(!Number.isSafeInteger(n)||n<start||n>=next||!Number.isSafeInteger(index)||index<0||!b||!/^0x[0-9a-f]{64}$/i.test(l.transaction_hash)||!/^0x[0-9a-f]*$/i.test(l.data))throw Error('Incomplete HyperSync log; checkpoint retained');
      if(l.block_hash&&l.block_hash!==b.hash)throw Error('Inconsistent HyperSync block hash');
      logs.push({address:EXCHANGE,blockNumber:hex(n),blockHash:b.hash,transactionHash:l.transaction_hash,logIndex:hex(index),data:l.data,topics:[l.topic0,l.topic1,l.topic2,l.topic3].filter(t=>t!=null),removed:l.removed===true});
    }
  }
  return {next,logs,blocks,rows:decodeLogs(logs,times)};
}
export class HyperSync {
  constructor(token,{fetcher=fetch}={}){if(!token)throw Error('HyperSync token required');this.token=token;this.fetcher=fetcher;this.readyAt=0;}
  async page(start,end){
    const response=await this.fetcher(HYPERSYNC_URL+'/query',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+this.token},body:JSON.stringify(historyQuery(start,end)),signal:AbortSignal.timeout(45000),redirect:'error'});
    // Do not log response bodies: upstream errors must not leak credentials.
    if(response.status===429){
      const retryMs=hyperSyncRetryMs(response.headers);
      this.readyAt=Math.max(this.readyAt,Date.now()+retryMs);const e=Error('HyperSync rate limit; provider cooldown '+Math.ceil(retryMs/1000)+' seconds.');e.retryMs=retryMs;throw e;
    }
    if(response.status===401||response.status===403)throw Error('HyperSync token rejected. Run Setup HyperSync.cmd with an active free HyperSync token, then restart.');
    if(!response.ok)throw Error('HyperSync HTTP '+response.status+'; checkpoint retained.');
    const result=await response.json();
    if(result.next_block===start&&Number(result.archive_height)<start){const e=Error('Waiting for HyperSync archive to catch up.');e.retryMs=15000;throw e;}
    return parsePage(result,start,end);
  }
}
