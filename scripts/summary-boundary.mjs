import {writeFileSync} from 'node:fs';
import {Rpc} from '../indexer/chain.mjs';
const rpc=new Rpc('https://rpc.monad.xyz',120),cutoff=Date.parse('2026-10-13T00:00:00Z')/1000;
let low=110367733,high=Number(BigInt((await rpc.block()).number));
while(low<high){const mid=Math.floor((low+high)/2),b=await rpc.block(mid);if(Number(BigInt(b.timestamp))<cutoff)low=mid+1;else high=mid;}
const before=await rpc.block(low-1),first=await rpc.block(low);
if(Number(BigInt(before.timestamp))>=cutoff||Number(BigInt(first.timestamp))<cutoff||first.parentHash!==before.hash)throw Error('Invalid cutoff');
const value={cutoff:'2026-10-13T00:00:00Z',fromBlock:54773010,toBlockExclusive:low,parentHash:before.hash,firstHash:first.hash,previousTime:Number(BigInt(before.timestamp))*1000,firstTime:Number(BigInt(first.timestamp))*1000};
writeFileSync(new URL('../indexer/summary-boundary.json',import.meta.url),JSON.stringify(value,null,2)+'\n');console.log(value);
