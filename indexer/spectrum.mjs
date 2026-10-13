import {Rpc,errors,EXCHANGE,DEPLOYMENT_BLOCK,topics,hex,decodeLogs} from './chain.mjs';
import {orderedRanges} from './parallel.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const methods=new Set(['eth_chainId','eth_blockNumber','eth_getBlockByNumber','eth_getLogs','eth_getTransactionReceipt','eth_call']);
export function endpointUrl(value){
  let u;try{u=new URL(value);}catch{throw Error('Enter the full Spectrum HTTPS endpoint URL.');}
  if(u.protocol!=='https:'||u.username||u.password||u.hash||/[\s"']/.test(value))throw Error('Invalid Spectrum HTTPS endpoint URL.');
  return u.href;
}
export function retryDelay(headers,now=Date.now()){
  const retry=headers.get('retry-after');
  if(retry){const seconds=Number(retry);return Number.isFinite(seconds)?Math.max(1000,seconds*1000):Math.max(1000,Date.parse(retry)-now||60000);}
  const reset=Number(headers.get('x-ratelimit-reset'));
  return Number.isFinite(reset)&&reset>0?Math.max(1000,reset*1000-now):60000;
}
export class RequestGate {
  constructor(rps=100,concurrency=16){if(!Number.isFinite(rps)||rps<1||rps>150)throw Error('Spectrum RPS must be between 1 and 150.');this.spacing=1000/rps;this.concurrency=concurrency;this.nextAt=0;this.readyAt=0;this.queue=Promise.resolve();this.active=0;this.waiters=[];}
  throttle(retryMs){
    // Multiple in-flight 429s belong to one incident, not multiple halvings.
    if(this.readyAt<=Date.now())this.spacing=Math.min(1000,this.spacing*2);
    this.readyAt=Math.max(this.readyAt,Date.now()+retryMs);
  }
  async run(fn){
    if(this.active>=this.concurrency)await new Promise(r=>this.waiters.push(r));else this.active++;
    try{
      const ticket=this.queue.then(async()=>{if(this.readyAt>Date.now()){const e=Error('Spectrum rate limit; waiting for provider cooldown.');e.retryMs=this.readyAt-Date.now();throw e;}await sleep(Math.max(0,this.nextAt-Date.now()));if(this.readyAt>Date.now()){const e=Error('Spectrum rate limit; waiting for provider cooldown.');e.retryMs=this.readyAt-Date.now();throw e;}this.nextAt=Date.now()+this.spacing;});
      this.queue=ticket.catch(()=>{});await ticket;return await fn();
    }finally{const waiter=this.waiters.shift();if(waiter)waiter();else this.active--;}
  }
}
export class SpectrumRpc extends Rpc {
  #endpoint;
  constructor(endpoint,{mode='rpc',rps=10,gate=new RequestGate(rps,4),fetcher=fetch}={}){
    super('https://spectrum.invalid',0);this.#endpoint=endpointUrl(endpoint);
    if(!['rpc','api'].includes(mode))throw Error('Spectrum mode must be rpc or api.');
    this.mode=mode;this.gate=gate;this.fetcher=fetcher;this.calls=0;
  }
  async call(method,params){
    if(!methods.has(method))throw Error('Spectrum adapter only allows read-only methods.');
    return this.gate.run(async()=>{
      const id=++this.calls,body=this.mode==='api'?{jsonrpc:'2.0',id,method:'rpcProxy',params:{chain:'monad',method,params}}:{jsonrpc:'2.0',id,method,params};
      let response;try{response=await this.fetcher(this.#endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(25000),redirect:'error'});}catch{throw Error('Spectrum connection failed or timed out; checkpoint retained.');}
      if(response.status===429){const retryMs=retryDelay(response.headers);this.gate.throttle(retryMs);const e=Error('Spectrum rate limit; waiting for provider cooldown, then retrying at '+(1000/this.gate.spacing).toFixed(1)+' requests/s.');e.retryMs=retryMs;throw e;}
      if(response.status===413&&method==='eth_getLogs')throw Error('Spectrum log range/result limit');
      if(!response.ok)throw Error('Spectrum HTTP '+response.status+(response.status===401||response.status===403?'; check the endpoint credential and IP allowlist.':response.status===402?'; check available Spectrum credits.':'; checkpoint retained.'));
      let j;try{j=await response.json();}catch{throw Error('Invalid Spectrum JSON response.');}
      const raise=error=>{
        let name='';try{name=errors.parseError(error.data)?.name||'';}catch{}
        const message=String(error.message||'');
        const e=Error(name||(/range|too many results|response.*large|response.*size.*limit|query returned more/i.test(message)?'Spectrum log range/result limit':/rate limit|too many requests/i.test(message)?'Spectrum rate limit':/method.*not.*found|unsupported method/i.test(message)?'Spectrum method unavailable':/revert/i.test(message)?'Spectrum contract call reverted':'Spectrum RPC error (code '+String(Number(error.code)||0)+')'));
        e.contractError=name;
        e.rpcCode=Number(error.code);
        if(e.message==='Spectrum rate limit'){e.retryMs=60000;this.gate.throttle(e.retryMs);}
        throw e;
      };
      if(j.error)raise(j.error);
      if(j.id!==id)throw Error('Spectrum response ID mismatch.');
      if(this.mode==='api'){j=j.result?.data;if(!j||j.jsonrpc!=='2.0')throw Error('Invalid Spectrum rpcProxy envelope.');if(j.error)raise(j.error);}
      if(j.result==null){
        // Include only locally validated request fields, never the credential URL
        // or provider response body, in user-visible diagnostics.
        const block=method==='eth_getBlockByNumber'&&/^0x[0-9a-f]+$/i.test(String(params?.[0]))?' for block '+BigInt(params[0]).toString():'';
        const e=Error('Spectrum returned '+(j.result===null?'null':'a missing result')+' for '+method+block+'; checkpoint retained.');
        e.code='SPECTRUM_NO_RESULT';e.rpcMethod=method;throw e;
      }return j.result;
    });
  }
}
export async function mapLimit(values,limit,fn){
  const out=new Array(values.length);let next=0;
  const results=await Promise.allSettled(Array.from({length:Math.min(limit,values.length)},async()=>{while(next<values.length){const i=next++;out[i]=await fn(values[i]);}}));
  const error=results.find(r=>r.status==='rejected');if(error)throw error.reason;return out;
}
export class SpectrumBackfill {
  constructor(rpc,{workers=8,window=1000}={}){
    if(!Number.isInteger(workers)||workers<1||workers>12||!Number.isInteger(window)||window<1||window>10000)throw Error('Invalid Spectrum worker/window settings.');
    this.rpc=rpc;this.workers=workers;this.window=window;this.headers=new Map();
  }
  async block(n){
    if(!this.headers.has(n)){const p=this.rpc.block(n).then(b=>{if(Number(BigInt(b.number))!==n||!/^0x[0-9a-f]{64}$/i.test(b.hash)||!/^0x[0-9a-f]{64}$/i.test(b.parentHash)||!Number.isFinite(Number(BigInt(b.timestamp))))throw Error('Invalid Spectrum block header.');return b;}).catch(e=>{this.headers.delete(n);throw e;});this.headers.set(n,p);if(this.headers.size>4096)this.headers.delete(this.headers.keys().next().value);}
    return this.headers.get(n);
  }
  fetch(start,head){
    const ranges=[];for(let n=start;n<=head&&ranges.length<this.workers;n+=this.window)ranges.push({start:n,end:Math.min(head,n+this.window-1),source:'Spectrum'});
    return orderedRanges(ranges,r=>this.range(r));
  }
  async range({start,end}){
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<DEPLOYMENT_BLOCK||end<start)throw Error('Invalid Spectrum history range.');
    const rows=[];let next=start,span=this.window;
    while(next<=end){
      const last=Math.min(end,next+span-1);let logs;
      try{logs=await this.rpc.call('eth_getLogs',[{address:EXCHANGE,topics:[topics],fromBlock:hex(next),toBlock:hex(last)}]);}
      catch(e){if(/range\/result limit/.test(e.message)&&span>1){span=Math.max(1,Math.floor(span/2));continue;}throw e;}
      if(!Array.isArray(logs))throw Error('Invalid Spectrum log response.');
      // Native RPC has no pagination marker. Split conservatively rather than
      // accepting a response at a common provider truncation boundary.
      if(logs.length>=10000||[1000,2000,5000].includes(logs.length)){if(span===1)throw Error('Spectrum single-block log cap reached; checkpoint retained.');span=Math.max(1,Math.floor(span/2));continue;}
      for(const l of logs)if(Number(BigInt(l.blockNumber))<next||Number(BigInt(l.blockNumber))>last||l.address?.toLowerCase()!==EXCHANGE)throw Error('Spectrum log outside requested filter.');
      const numbers=[...new Set(logs.filter(l=>!l.blockTimestamp).map(l=>Number(BigInt(l.blockNumber))))];
      const blocks=await mapLimit(numbers,12,n=>this.block(n));const times=new Map(numbers.map((n,i)=>[n,Number(BigInt(blocks[i].timestamp))*1000]));
      for(const l of logs){const n=Number(BigInt(l.blockNumber)),i=numbers.indexOf(n);if(i>=0&&blocks[i].hash!==l.blockHash)throw Error('Spectrum log/header mismatch.');}
      rows.push(...decodeLogs(logs,times));next=last+1;
      if(rows.length>200000)throw Error('Spectrum range memory limit reached; reduce SPECTRUM_WINDOW_BLOCKS.');
    }
    const first=await this.block(start),last=await this.block(end);
    for(const row of rows)if(row.block===end&&row.hash!==last.hash)throw Error('Spectrum checkpoint hash mismatch.');
    return {start,end,hash:last.hash,firstParentHash:first.parentHash,time:Number(BigInt(last.timestamp))*1000,rows,source:'Spectrum'};
  }
}
export function spectrumMixed(env=process.env){return !!env.SPECTRUM_ENDPOINT&&env.PERPL_HISTORY_SOURCE==='mixed';}
export function spectrumConfigured(env=process.env){return !!env.SPECTRUM_ENDPOINT&&!['hypersync','mixed'].includes(env.PERPL_HISTORY_SOURCE);}
export function spectrumClient(env=process.env,{live=false}={}){return new SpectrumRpc(env.SPECTRUM_ENDPOINT,{mode:env.SPECTRUM_MODE||'rpc',rps:live?2:Number(env.SPECTRUM_RPS||10)});}
