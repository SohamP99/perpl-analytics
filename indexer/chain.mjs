import {readFileSync} from 'node:fs';
import {Interface} from 'ethers';
export const EXCHANGE = '0x34b6552d57a35a1d042ccae1951bd1c370112a6f';
export const DEPLOYMENT_BLOCK = 54773010;
export const HISTORY_START = Date.UTC(2026, 1, 1);
export const abi = new Interface(JSON.parse(readFileSync(new URL('./exchange-abi.json', import.meta.url))));
export const errors = new Interface(JSON.parse(readFileSync(new URL('./errors-abi.json', import.meta.url))));
export const eventNames = ['AccountCreated','CollateralDeposit','CollateralWithdrawal','OrderRequest','OrderRequestV2','MakerOrderFilled','MakerOrderFilledV2','TakerOrderFilled','TakerOrderFilledV2','PositionOpened','PositionOpenedV2','PositionIncreased','PositionIncreasedV2','PositionInverted','PositionClosed','PositionDecreased','PositionDeleveraged','PositionDeleveragedV2','PositionLiquidated','PositionUnwound','PositionUnwoundV2','PositionUnwoundWithoutPayment','PositionUnwoundWithoutPaymentV2','IncreasePositionCollateral','PositionCollateralDecreased'];
export const topics = eventNames.map(n => abi.getEvent(n).topicHash);
const eventFragments = new Map(eventNames.map(n => {const f=abi.getEvent(n);return [f.topicHash,f];}));
export const storedTopics = topics.filter(t=>!eventFragments.get(t).name.startsWith('OrderRequest'));
export const hex = n => '0x' + BigInt(n).toString(16);
export const stringify = v => JSON.stringify(v, (_, x) => typeof x === 'bigint' ? x.toString() : x);
export function positionIds(banks){const offsets=[0,253,509,765],ids=[];for(let bank=0;bank<4;bank++)for(let bit=0;bit<(bank===0?253:256);bit++)if((banks[bank]>>BigInt(bit))&1n)ids.push(offsets[bank]+bit);return ids;}
const sleep = ms => new Promise(r => setTimeout(r, ms));
export class Rpc {
  constructor(url = process.env.PERPL_RPC_URL || 'https://rpc2.monad.xyz', interval = 400, {timeoutMs=25000,attempts=4}={}) {this.timeoutMs=timeoutMs;this.attempts=attempts;this.url=url;this.interval=interval;this.queue=Promise.resolve();this.calls=0;}
  async call(method, params) {
    const result=this.queue.then(async()=>{
      for(let attempt=0;attempt<this.attempts;attempt++) {
        this.calls++;
        try {
          const r=await fetch(this.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:this.calls,method,params}),signal:AbortSignal.timeout(this.timeoutMs)});
          if(r.status===429||r.status>=500)throw Error('RPC busy (HTTP '+r.status+')');
          if(!r.ok)throw Error('RPC HTTP '+r.status);
          const j=await r.json();if(j.error){let name='';try{name=errors.parseError(j.error.data)?.name||'';}catch{}const e=Error(name||j.error.message||'RPC error');e.contractError=name;throw e;}
          if(j.result==null)throw Error('RPC returned no result');return j.result;
        } catch(e) {
          if(e.contractError||/range|limit exceeded|too many results|response.*large|revert|selector/i.test(e.message)||attempt===this.attempts-1)throw e;
          await sleep(1000*2**attempt);
        }
      }
    });
    this.queue=result.catch(()=>{}).then(()=>sleep(this.interval));return result;
  }
  async block(n='latest'){return this.call('eth_getBlockByNumber',[typeof n==='number'?hex(n):n,false]);}
  async read(name,args=[],block='latest',from){const value=await this.call('eth_call',[{to:EXCHANGE,data:abi.encodeFunctionData(name,args),...(from?{from}:{})},typeof block==='number'?hex(block):block]);return abi.decodeFunctionResult(name,value);}
}
// Taker events omit account/market: only their own transaction's preceding
// OrderRequest is valid context. Never carry that context across transactions.
export function decodeLogs(logs, blockTimes = new Map()) {
  // Request/cancel traffic dominates Perpl logs. Only fills need request context.
  // Cache ABI fragments to avoid ethers re-hashing every event signature per log.
  const takerTransactions=new Set(logs.filter(l=>eventFragments.get(l.topics[0])?.name.startsWith('TakerOrderFilled')).map(l=>l.transactionHash));
  let tx='',request=null;const rows=[];
  for(const log of [...logs].sort((a,b)=>Number(BigInt(a.blockNumber)-BigInt(b.blockNumber))||Number(BigInt(a.logIndex)-BigInt(b.logIndex)))) {
    if(log.removed)throw Error('Removed log received; checkpoint not advanced');
    if(log.address.toLowerCase()!==EXCHANGE)throw Error('Unexpected log contract');
    if(log.transactionHash!==tx){tx=log.transactionHash;request=null;}
    const fragment=eventFragments.get(log.topics[0]);if(!fragment)throw Error('Unknown event topic');
    const name=fragment.name;
    if(name.startsWith('OrderRequest')&&!takerTransactions.has(log.transactionHash))continue;
    const decoded=abi.decodeEventLog(fragment,log.data,log.topics);
    const args=Object.fromEntries(fragment.inputs.map((p,i)=>[p.name,typeof decoded[i]==='bigint'?decoded[i].toString():decoded[i]]));
    if(name.startsWith('OrderRequest')){request=args;continue;}
    if(name.startsWith('TakerOrderFilled')){
      if(!request)throw Error('Taker fill missing OrderRequest context; refusing incomplete history');
      args.accountId=request.accountId;args.perpId=request.perpId;args.orderType=request.orderType;
    }
    const block=Number(BigInt(log.blockNumber)),time=log.blockTimestamp?Number(BigInt(log.blockTimestamp))*1000:blockTimes.get(block);
    if(!Number.isFinite(time))throw Error('Missing block timestamp');
    if(block<DEPLOYMENT_BLOCK||time<HISTORY_START)continue;
    rows.push({id:log.transactionHash+':'+Number(BigInt(log.logIndex)),block,hash:log.blockHash,tx:log.transactionHash,logIndex:Number(BigInt(log.logIndex)),time,name,account:String(args.accountId??args.posAccountId??args.id??''),market:String(args.perpId??''),args});
  }
  return rows;
}
export function positionView(p,m,margin,mark,valid){
  const priceScale=10**m.config.price_decimals,sizeScale=10**m.config.size_decimals;
  const side=Number(p.positionType),residue=Number(p.priceResiduePNSQ16||0n);
  const entry=(Number(p.pricePNS)+(residue?(side===0?-1:0)+residue/65536:0))/priceScale;
  const size=Number(p.lotLNS)/sizeScale,collateral=Number(p.depositCNS)/1e6,funding=Number(p.premiumPnlCNS)/1e6,notional=entry*size;
  const maintenance=Number(margin)/100;
  return {market:m.id,symbol:m.symbol||m.name||m.size_units||String(m.id),side:side===0?'Long':'Short',size,sizeDecimals:m.config.size_decimals,sizeLots:String(p.lotLNS),entry,collateral,mark:valid?Number(mark)/priceScale:null,unrealized:valid?Number(p.pnlCNS)/1e6:null,funding,leverage:collateral>0?notional/collateral:null,liquidation:size>0&&maintenance>0?Math.max(0,entry+(side===0?1:-1)*(notional/maintenance-collateral-funding)/size):null,entryBlock:Number(p.entryBlock)};
}
