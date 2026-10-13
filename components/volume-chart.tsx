'use client';
import {useId,useState} from 'react';
import {Area,Bar,CartesianGrid,ComposedChart,Line,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import {Raw,money} from '@/lib/perpl';

const dateLabel=(t:number,monthly=false)=>new Date(t).toLocaleDateString('en-US',{timeZone:'UTC',month:'short',...(monthly?{year:'2-digit' as const}:{day:'numeric' as const})});
function Crosshair(props:any){const point=props.points?.[0];if(!point)return <g/>;const y=Math.max(point.y,Math.min(point.y+props.height,props.pointerY??point.y));return <g className="volume-crosshair"><line x1={point.x} x2={point.x} y1={point.y} y2={point.y+props.height}/>{props.pointerY!==null&&<><line x1={props.left} x2={props.left+props.width} y1={y} y2={y}/><circle cx={point.x} cy={y} r={3}/></>}</g>};
export function VolumeChart({data,kind='bar',interval='1D'}:{data:Raw[],kind?:string,interval?:string}){
 const [cumulative,setCumulative]=useState(true),[intervalVisible,setIntervalVisible]=useState(true);let running=0;const combined=data.map(d=>({...d,cumulative:running+=d.v}));
 const id=useId().replace(/:/g,''),[pointerY,setPointerY]=useState<number|null>(null);

 return <><div className="chart-legend"><button aria-pressed={intervalVisible} className={intervalVisible?'':'legend-off'} onClick={()=>setIntervalVisible(!intervalVisible)}><i style={{background:'var(--purple)'}}/>Interval volume</button><button className={'cumulative-toggle '+(cumulative?'active':'')} aria-pressed={cumulative} onClick={()=>setCumulative(!cumulative)}>Cumulative</button></div><div className="volume-plot" data-interval={interval} data-buckets={data.length} data-mode={kind} role="img" aria-label={`Trading volume, ${interval==='1M'?'monthly':interval==='7D'?'weekly':'daily'} buckets, ${data.length} observations`} onMouseMove={e=>setPointerY(e.clientY-e.currentTarget.getBoundingClientRect().top)} onMouseLeave={()=>setPointerY(null)}>
 {!data.length?<div className="chart-empty">No volume observations available</div>:<><div className="volume-watermark" aria-hidden="true">PERPL PULSE</div><ResponsiveContainer width="100%" height="100%"><ComposedChart data={combined} barCategoryGap="12%" margin={{top:15,right:8,left:0,bottom:5}}>
 <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#b28bea" stopOpacity={0.28}/><stop offset="100%" stopColor="#b28bea" stopOpacity={0.015}/></linearGradient></defs>
 <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.55}/>
 <XAxis dataKey="t" tickFormatter={v=>dateLabel(Number(v),interval==='1M')} minTickGap={55} axisLine={{stroke:'var(--border)'}} tickLine={false} tickMargin={12} tick={{fill:'var(--muted)',fontSize:10}}/>
 <YAxis yAxisId="interval" width={63} tickFormatter={v=>money(Number(v))} axisLine={false} tickLine={false} tickMargin={12} tickCount={5} tick={{fill:'var(--muted)',fontSize:10}}/>
 <YAxis yAxisId="cumulative" orientation="right" hide={!cumulative} width={63} tickFormatter={v=>money(Number(v))} axisLine={false} tickLine={false} tick={{fill:'var(--muted)',fontSize:10}}/>
 <Tooltip cursor={<Crosshair pointerY={pointerY}/>} content={({active,payload,label})=>active&&payload?.length?<div className="volume-tooltip"><span>{dateLabel(Number(label),interval==='1M')}{interval==='7D'?' · week starting':''} · UTC</span>{intervalVisible&&<><strong>{money(Number(payload.find(p=>p.dataKey==='v')?.value),false)}</strong><small>{interval==='1M'?'Monthly':interval==='7D'?'Weekly':'Daily'} volume</small></>}{cumulative&&<><strong>{money(Number(payload.find(p=>p.dataKey==='cumulative')?.value),false)}</strong><small>Cumulative volume</small></>}</div>:null}/>
 {intervalVisible&&(kind==='bar'?<Bar yAxisId="interval" dataKey="v" fill="var(--purple)" isAnimationActive={false} activeBar={{fill:'var(--purple-bright)'}}/>:kind==='area'?<Area yAxisId="interval" dataKey="v" type="linear" stroke="var(--purple)" strokeWidth={1.6} fill={`url(#${id})`} isAnimationActive={false} activeDot={{r:3}}/>:<Line yAxisId="interval" dataKey="v" type="linear" stroke="var(--purple)" strokeWidth={1.6} dot={false} isAnimationActive={false} activeDot={{r:3}}/>)}
 {cumulative&&<Line yAxisId="cumulative" dataKey="cumulative" stroke="var(--purple-bright)" strokeWidth={2} strokeDasharray="5 2" dot={false} isAnimationActive={false}/>}
 </ComposedChart></ResponsiveContainer></>}
 </div></>;
}
