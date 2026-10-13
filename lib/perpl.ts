export type Raw = Record<string, any>;
export const money=(v:number|null|undefined,compact=true)=>v==null||!Number.isFinite(v)?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:compact?'compact':'standard',maximumFractionDigits:2}).format(v);
export const pct=(v:number|null|undefined,d=2)=>v==null||!Number.isFinite(v)?'—':`${v>0?'+':''}${v.toFixed(d)}%`;
export const price=(v:number|null|undefined)=>v==null||!Number.isFinite(v)?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:Math.abs(v)<1?6:Math.abs(v)<100?4:2}).format(v);
export const short=(s:string)=>s.slice(0,6)+'…'+s.slice(-4);
export function positionSize(p:Raw){
 if(/^\d+$/.test(p.sizeLots)&&Number.isInteger(p.sizeDecimals)&&p.sizeDecimals>=0&&p.sizeDecimals<=30){
  const digits=p.sizeLots.padStart(p.sizeDecimals+1,'0');
  return p.sizeDecimals?(digits.slice(0,-p.sizeDecimals)+'.'+digits.slice(-p.sizeDecimals)).replace(/\.?0+$/,''):digits;
 }
 if(!Number.isFinite(p.size))return '—';
 return new Intl.NumberFormat('en-US',{maximumSignificantDigits:15}).format(p.size);
}
export function normalize(m:Raw, ctx:Raw):Raw {
 const token=ctx.tokens.find((t:Raw)=>t.id===ctx.instances.find((i:Raw)=>i.id===m.instance_id)?.collateral_token_id);
 const scale=10**(token?.decimals??6), p=10**m.config.price_decimals,s=10**m.config.size_decimals;
 const v=m.state||{};
 return {...m, symbol:m.symbol||m.name||m.size_units||String(m.id),scale,priceScale:p,sizeScale:s,price:v.mrk==null?null:v.mrk/p,volume:v.dva==null?null:Number(v.dva)/scale,oi:v.oi==null||v.mrk==null?null:v.oi/s*v.mrk/p,tvl:v.tvl==null?null:Number(v.tvl)/scale,change:v.prv>0?(v.lst/v.prv-1)*100:null,rate:m.funding?.rate==null?null:m.funding.rate/10000,spread:v.mid>0?(v.ask-v.bid)/v.mid*10000:null,basis:v.orl>0?(v.mrk/v.orl-1)*100:null};
}
export async function api(path:string,headers:Record<string,string>={},signal?:AbortSignal):Promise<Raw> {
 const r=await fetch('/api/perpl'+path,{headers,signal:signal||AbortSignal.timeout(20000)});
 const data=await r.json() as Raw; if(!r.ok)throw new Error(data.error||`API error ${r.status}`);return data;
}
const b64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
export async function importReadKey(hex:string) {
 const raw=hex.replace(/^0x/,'');if(!/^[a-fA-F0-9]{64}$/.test(raw))throw new Error('Enter the 32-byte Ed25519 API secret (64 hex characters).');
 const der=Uint8Array.from(('302e020100300506032b657004220420'+raw).match(/../g)!.map(v=>parseInt(v,16)));
 return crypto.subtle.importKey('pkcs8',der,{name:'Ed25519'},false,['sign']);
}
export async function signedApi(path:string,token:string,key:CryptoKey) {
 const timestamp=String(Date.now()),nonce=b64(crypto.getRandomValues(new Uint8Array(18)));
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array()))).map(x=>x.toString(16).padStart(2,'0')).join('');
 const canonical=['143','GET',path,timestamp,nonce,hash].join('\n');
 const signature=b64(new Uint8Array(await crypto.subtle.sign('Ed25519',key,new TextEncoder().encode(canonical))));
 return api(path,{'X-API-Key':token,'X-API-Timestamp':timestamp,'X-API-Nonce':nonce,'X-API-Signature':signature});
}
export function analyzeEvents(history:Raw[],scale:number) {
 const seen=new Set<string>();
 const events=history.flatMap(p=>p.e?.length?p.e:[p]).filter(p=>[13,14,15,19,22].includes(p.sr)).filter(p=>{const id=[p.acc,p.mkt,p.pid,p.at?.b,p.at?.tx,p.at?.l,p.sr].join(':');if(seen.has(id))return false;seen.add(id);return true;}).sort((a,b)=>(a.at?.t||0)-(b.at?.t||0));
 const net=(p:Raw)=>(Number(p.dpnl||0)+Number(p.fnd||0)-Number(p.fee||0))/scale;
 const values=events.map(net),wins=values.filter(x=>x>0),loss=values.filter(x=>x<0);
 let streak=0,best=0,worst=0;for(const x of values){streak=x>0?Math.max(0,streak)+1:x<0?Math.min(0,streak)-1:0;best=Math.max(best,streak);worst=Math.min(worst,streak);}
 const byMarket:Record<string,number>={};events.forEach(p=>byMarket[p.mkt]=(byMarket[p.mkt]||0)+net(p));
 const ranked=Object.entries(byMarket).sort((a,b)=>b[1]-a[1]);
 const timed=events.filter(p=>p.at?.t&&p.ots?.t&&p.at.t>=p.ots.t);
 return {events,net,winRate:values.length?wins.length/values.length*100:null,profitFactor:loss.length?wins.reduce((a,b)=>a+b,0)/-loss.reduce((a,b)=>a+b,0):wins.length?Infinity:null,bestStreak:best,worstStreak:-worst,hold:timed.length?timed.reduce((s,p)=>s+p.at.t-p.ots.t,0)/timed.length/3600000:null,bestMarket:ranked[0]?.[0],worstMarket:ranked.at(-1)?.[0]};
}
export function drawdown(chart:Raw[],scale:number){let peak=0,max=0;for(const p of chart){const v=Number(p.v)/scale;peak=Math.max(peak,v);if(peak>0)max=Math.max(max,(peak-v)/peak*100);}return chart.length?max:null;}
