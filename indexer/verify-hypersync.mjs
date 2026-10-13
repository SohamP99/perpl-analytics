import assert from 'node:assert/strict';
import {HyperSync} from './hypersync.mjs';
import {Rpc,DEPLOYMENT_BLOCK,EXCHANGE,topics,hex,decodeLogs} from './chain.mjs';

// Compare the alternative source against RPC on a small, recent finalized sample.
// Neither sample writes to the user's historical database.
export async function verifyHyperSync(token){
  const rpc=new Rpc(undefined,100),source=new HyperSync(token);
  if(Number(BigInt(await rpc.call('eth_chainId',[])))!==143)throw Error('Expected Monad mainnet');
  const head=await rpc.block(),start=Math.max(DEPLOYMENT_BLOCK,Number(BigInt(head.number))-1000000),end=start+99;
  const began=Date.now();const pages=[];let next=start;
  while(next<=end){const page=await source.page(next,end);pages.push(page);next=page.next;}
  const hypersyncMs=Date.now()-began,actual=pages.flatMap(p=>p.rows);
  const logs=await rpc.call('eth_getLogs',[{address:EXCHANGE,topics:[topics],fromBlock:hex(start),toBlock:hex(end)}]);
  const times=new Map();for(const l of logs)if(!l.blockTimestamp){const n=Number(BigInt(l.blockNumber));if(!times.has(n))times.set(n,Number(BigInt((await rpc.block(n)).timestamp))*1000);}
  const expected=decodeLogs(logs,times);
  try{assert.deepEqual(actual,expected);}catch{throw Error('HyperSync/RPC event comparison failed; token was not saved.');}
  return {start,end,events:actual.length,hypersyncMs};
}
