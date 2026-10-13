import {DatabaseSync} from 'node:sqlite';
import {EXCHANGE,topics,hex} from '../indexer/chain.mjs';
process.loadEnvFile(new URL('../.env',import.meta.url));
const endpoint=process.env.SPECTRUM_ENDPOINT;
if(!endpoint)throw Error('Spectrum is not configured');
const db=new DatabaseSync(new URL('../.perpl-data/index.sqlite',import.meta.url),{readOnly:true});
const start=JSON.parse(db.prepare("SELECT value FROM meta WHERE key='futureNext'").get().value);db.close();
const scrub=value=>{
 let s=String(value||'').replaceAll(endpoint,'[private endpoint]').replace(/https?:\/\/\S+/g,'[URL]');
 for(const segment of new URL(endpoint).pathname.split('/').filter(s=>s.length>8))s=s.replaceAll(segment,'[private]');
 return s.slice(0,400);
};
let id=0;
for(const [method,params] of [['eth_chainId',[]],['eth_getBlockByNumber',[hex(start),false]],['eth_getLogs',[{address:EXCHANGE,topics:[topics],fromBlock:hex(start),toBlock:hex(start+49)}]],['eth_getLogs',[{address:EXCHANGE,topics:[topics],fromBlock:hex(start),toBlock:hex(start+999)}]]]){
 const body=process.env.SPECTRUM_MODE==='api'?{jsonrpc:'2.0',id:++id,method:'rpcProxy',params:{chain:'monad',method,params}}:{jsonrpc:'2.0',id:++id,method,params};
 const t=Date.now();
 try{
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(25000),redirect:'error'});
  const j=await response.json(),r=process.env.SPECTRUM_MODE==='api'?j.result?.data:j;
  console.log(JSON.stringify({method,span:method==='eth_getLogs'?Number(BigInt(params[0].toBlock)-BigInt(params[0].fromBlock)+1n):null,http:response.status,ms:Date.now()-t,headers:Object.fromEntries(['retry-after','x-ratelimit-limit','x-ratelimit-remaining','x-ratelimit-reset'].map(k=>[k,response.headers.get(k)])),code:j.error?.code??r?.error?.code,message:scrub(j.error?.message??r?.error?.message),result:r?.result===null?'null':Array.isArray(r?.result)?r.result.length:r?.result!=null?'present':'missing'}));
 }catch{console.log(JSON.stringify({method,error:'Request failed or timed out'}));}
 await new Promise(r=>setTimeout(r,1000));
}
