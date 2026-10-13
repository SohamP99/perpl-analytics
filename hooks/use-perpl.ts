'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Raw,api,normalize} from '@/lib/perpl';
import {historyWindow,bucketVolume} from '@/lib/history';
import {historicalMarkets} from '@/lib/historical-markets';
export function usePerpl(){
 const [ctx,setCtx]=useState<Raw|null>(null),[error,setError]=useState(''),[status,setStatus]=useState('Connecting'),[updated,setUpdated]=useState(0),[now,setNow]=useState(Date.now()),[nextSync,setNextSync]=useState(0);
 useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t)},[]);
 useEffect(()=>{let stopped=false,running=false,timer:ReturnType<typeof setTimeout>,due=0;const controller=new AbortController();
  const refresh=async()=>{if(stopped||running)return;running=true;setStatus('Syncing');clearTimeout(timer);let next=Date.now()+20000;
   try{const r=await fetch('/api/local/market-snapshot',{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(25000)]),cache:'no-store'});if(!r.ok)throw Error('Market refresh delayed');const value=await r.json() as Raw;if(stopped)return;setCtx(value.data);setUpdated(value.at);setStatus(value.stale?'Retrying':'Synced');setError(value.stale?'Refresh delayed. Showing saved data.':'');next=value.stale?Date.now()+20000:Math.max(Date.now()+1000,value.at+300000);window.dispatchEvent(new Event('perpl-sync'));}
   catch{if(!stopped){setError('Refresh delayed. Retrying automatically.');setStatus('Retrying')}}
   finally{running=false;if(!stopped){due=next;setNextSync(next);timer=setTimeout(refresh,Math.max(1000,next-Date.now()));}}};
  const wake=()=>{if(!document.hidden&&Date.now()>=due)refresh()};refresh();document.addEventListener('visibilitychange',wake);window.addEventListener('focus',wake);window.addEventListener('online',wake);
  return()=>{stopped=true;controller.abort();clearTimeout(timer);document.removeEventListener('visibilitychange',wake);window.removeEventListener('focus',wake);window.removeEventListener('online',wake)};
 },[]);
 const markets=useMemo(()=>ctx?ctx.markets.map((m:Raw)=>normalize(m,ctx)):[],[ctx]);
 return {ctx,markets,error,status,updated,now,nextSync};
}
export function useCandles(ctx:Raw|null,period:string,selected:string){const [series,setSeries]=useState<Raw[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');const ref=useRef(ctx);ref.current=ctx;const ids=ctx?.markets.map((m:Raw)=>m.id).join(',');
 useEffect(()=>{if(!ref.current)return;const controller=new AbortController();let stopped=false,running=false;setLoading(true);setError('');setSeries([]);
 const load=async()=>{if(running)return;running=true;try{const {end,from,resolution:res}=historyWindow('ALL',Math.floor(Date.now()/300000)*300000);
 const chosen=historicalMarkets(ref.current!).filter((m:Raw)=>selected==='all'||String(m.id)===selected),results=await Promise.allSettled(chosen.map(async(m:Raw)=>({m:normalize(m,ref.current!),data:await api(`/v1/market-data/${m.id}/candles/${res}/${from}-${end}`,{},controller.signal)})));
 if(stopped)return;const map=new Map<number,Raw>();let failures=0;for(const r of results){if(r.status==='rejected'){failures++;continue}if(r.value.data._stale)failures++;for(const c of r.value.data.d||[]){if(c.t<from||c.t>end)continue;const point=map.get(c.t)||{t:c.t,v:0};const value=Number(c.v)/r.value.m.scale;point.v+=value;point['m'+r.value.m.id]=value;map.set(c.t,point)}}setSeries([...map.values()].sort((a,b)=>a.t-b.t));setError(failures?`${failures} markets unavailable · partial volume`:'');
 }catch(e){if(!stopped)setError((e as Error).message)}finally{running=false;if(!stopped)setLoading(false)}};load();window.addEventListener('perpl-sync',load);return()=>{stopped=true;controller.abort();window.removeEventListener('perpl-sync',load)}
 },[ids,selected]);const bucketed=useMemo(()=>bucketVolume(series as {t:number,v:number}[],period),[series,period]);return {series:bucketed,daily:series,loading,error};}
