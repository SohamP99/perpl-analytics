import {EXCHANGE,topics,hex} from './chain.mjs';

const canonical=logs=>{
  if(!Array.isArray(logs))throw Error('Invalid retention-probe logs');
  return logs.map(l=>JSON.stringify([l.address?.toLowerCase(),l.blockHash,l.transactionHash,String(BigInt(l.logIndex)),l.topics,l.data])).sort();
};
// Find a tested boundary assuming retention increases toward the head. Each
// actual indexed range is still validated; this is not proof of all intervening data.
export async function findSpectrumStart(client,reference,low,high,report=()=>{},{marginBlocks=10000,resolutionBlocks=1000}={}){
  if(!Number.isSafeInteger(low)||!Number.isSafeInteger(high)||low>high)throw Error('Invalid retention search bounds');
  if(!Number.isSafeInteger(marginBlocks)||marginBlocks<1||!Number.isSafeInteger(resolutionBlocks)||resolutionBlocks<1)throw Error('Invalid retention safety settings');
  let probes=0;
  const verified=new Map();
  async function available(n){
    const ref=await reference.block(n);
    if(!ref||Number(BigInt(ref.number))!==n)throw Error('Public RPC could not verify retention probe');
    let actual;
    try{actual=await client.block(n);}catch(e){if(e.code==='SPECTRUM_NO_RESULT'){report(n,false);probes++;return false;}throw e;}
    if(actual.hash!==ref.hash)throw Error('Spectrum/public RPC block mismatch during retention probe');
    const filter={address:EXCHANGE,topics:[topics],fromBlock:hex(n),toBlock:hex(n)};
    const expected=await reference.call('eth_getLogs',[filter]);
    let logs;
    try{logs=await client.call('eth_getLogs',[filter]);}catch(e){
      if(e.rpcCode!==-32603)throw e;
      // Confirm the generic server error twice before treating this block as
      // inaccessible. Authentication, quota and transport errors abort the search.
      try{logs=await client.call('eth_getLogs',[filter]);}catch(retry){if(retry.rpcCode!==-32603)throw retry;report(n,false);probes++;return false;}
    }
    const matches=JSON.stringify(canonical(logs))===JSON.stringify(canonical(expected));
    if(matches)verified.set(n,actual);
    report(n,matches);probes++;return matches;
  }
  if(!await available(high))throw Error('Spectrum cannot serve confirmed recent block/log data; no parallel source configured');
  let left=low,right=high;
  // Retention advances as the chain grows. Resolving its exact oldest block
  // creates a race we cannot win reliably; use a coarse bound plus headroom.
  while(right-left>resolutionBlocks){const middle=left+Math.floor((right-left)/2);if(await available(middle))right=middle;else left=middle+1;}
  for(let attempt=0;attempt<4;attempt++){
    const start=attempt===3?high:Math.min(high,right+marginBlocks*2**attempt);
    if(await available(start)){
      const first=verified.get(start);
      return {start,time:Number(BigInt(first.timestamp))*1000,probes,boundaryLower:left,boundaryUpper:right,marginBlocks:start-right};
    }
    if(start===high)break;
  }
  throw Error('Spectrum could not maintain access to a buffered recent range; configuration unchanged');
}
