'use client';
import {useEffect,useState} from 'react';
import {Database} from 'lucide-react';
import {Raw,money} from '@/lib/perpl';
import {localRead} from './local-data';
import {Chart,Metric,Tag,stamp} from './pulse-ui';
export function useProtocolSummary(){
 const [data,setData]=useState<Raw|null>(null),[error,setError]=useState('');
 useEffect(()=>{let stopped=false;async function load(){try{const r=await localRead('protocol');if(!stopped){setData(r);setError('')}}catch(e){if(!stopped)setError((e as Error).message)}}load();const t=setInterval(load,30000);return()=>{stopped=true;clearInterval(t)}},[]);
 return {data,error};
}
export function LocalProtocol({flows=false,data,error=''}:{flows?:boolean,data:Raw|null,error?:string}){
 const c=data?.coverage,hasValues=c?.historicalImported||c?.throughTime;
 return <section className="panel local-panel"><div className="panel-head"><h2>{flows?'Capital flows':'Protocol summaries'}</h2><Tag>5-MIN UPDATES</Tag></div>{error&&<div className="alert">{error}</div>}{data&&c?<>
 <div className="indexer-coverage"><div className="inline"><Database size={15}/><b>{c.historicalImported?'Historical summaries imported':'Historical CSVs awaiting import'}</b><Tag>{c.historicalImported?'DUNE SNAPSHOT':'PENDING'}</Tag></div><p>Historical window: February 1 – October 12, 2026 UTC. No live Dune API connection.</p><p>{c.throughTime?`New chain data through ${stamp(c.throughTime)} UTC`:'New chain updates start October 13, 2026 at 00:00 UTC.'} · {c.running?'Update in progress':c.retryAt?`Provider retry scheduled ${stamp(c.retryAt)} UTC`:c.nextRun?`Next cycle ${stamp(c.nextRun)} UTC`:'Starts with the backend'}</p>{!c.historicalImported&&<p>Historical totals are unavailable. Any figures below cover new chain updates only.</p>}{c.lastAttempt&&<p>Last attempt {stamp(c.lastAttempt)} UTC · Next block {Number(c.nextBlock).toLocaleString()}</p>}{c.error&&<p className="red">{c.error}</p>}</div>
 <div className="metric-grid"><Metric title="Deposits" value={hasValues?money(data.deposits):'—'} note="Account collateral deposits"/><Metric title="Withdrawals" value={hasValues?money(data.withdrawals):'—'} note="Account collateral withdrawals"/><Metric title="Trading fees" value={hasValues?money(data.fees):'—'} note="Recorded maker + taker fees; builder fees separate"/><Metric title="Trading accounts" value={hasValues&&data.activeAccounts!=null?Number(data.activeAccounts).toLocaleString():'—'} note={c.historicalImported&&!c.activityImported?'Historical activity import pending':'Distinct Perpl account IDs in covered data'}/></div>
 <div className="metric-grid"><Metric title="Liquidation events" value={hasValues?String(data.liquidations):'—'} note="Event count; a position may have partial liquidations"/><Metric title="New accounts" value={hasValues?String(data.newAccounts):'—'} note="AccountCreated events"/><Metric title="Position protocol fees" value={hasValues?money(data.positionProtocolFees):'—'} note="Recorded protFeeCNS; not net revenue"/><Metric title="Position insurance fees" value={hasValues?money(data.insuranceFees):'—'} note={`Builder fees separately: ${hasValues?money(data.builderFees):'—'}`}/></div>
 {flows&&<><div className="panel-head"><h3>Daily net capital inflows</h3><Tag>UTC DAYS</Tag></div><Chart data={data.daily} kind="bar"/></>}
 <p className="panel-caption">Historical Dune summaries and new chain batches use nonoverlapping block ranges. Current day may be partial. Updates require the backend to remain running; overdue batches catch up from their saved checkpoint.</p>
 </>:!error&&<div className="chart-loading">Loading saved summaries…</div>}</section>;
}
