import { build } from 'esbuild';
import { createServer, get } from 'node:http';
import { readFile, mkdir, appendFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GET } from '../app/api/perpl/[...path]/route.ts';
import { Indexer } from '../indexer/service.mjs';
import {SummaryStore} from '../indexer/summary-store.mjs';
import {SummaryEngine} from '../indexer/summary-engine.mjs';
const requestedPort=Number(process.env.PERPL_LOCAL_PORT||0);
let port=requestedPort;
const root=fileURLToPath(new URL('../',import.meta.url));
// Server-only configuration; never bundled into the browser or source archive.
try{process.loadEnvFile(path.join(root,'.env'));}catch(e){if(e.code!=='ENOENT')throw e;}
const out=path.join(root,'.sites-runtime','local-dashboard');
await mkdir(out,{recursive:true});
const diagnosticFile=path.join(root,'.sites-runtime','local-connection.log');
const log=async(message)=>{console.log(message);await appendFile(diagnosticFile,new Date().toISOString()+' '+message+'\n')};
await log('Starting Perpl Pulse; PID '+process.pid+'; Node '+process.version);
const indexer=new Indexer();
const summaryStore=new SummaryStore(path.join(process.env.PERPL_DATA_DIR||path.join(root,'.perpl-data'),'summaries.sqlite'));
summaryStore.importSavedDetails(indexer.store);
const summaries=new SummaryEngine(summaryStore,{refreshWallets:async()=>{const rows=indexer.store.db.prepare('SELECT address FROM snapshots ORDER BY time DESC LIMIT 25').all();for(const r of rows){try{await indexer.readWallet(r.address)}catch{}}}});
// The server handles live wallet reads; a separate thread owns historical import.
// Expensive UI reads cannot block the indexer's network loop or lease heartbeat.
// Old raw history is retained, but this launcher never resumes its backfill.
if(process.env.PERPL_SUMMARY_REFRESH_DISABLED!=='1')summaries.start();
await build({stdin:{contents:"import React from 'react'; import {createRoot} from 'react-dom/client'; import Dashboard from './components/dashboard'; import './app/globals.css'; createRoot(document.getElementById('root')).render(<Dashboard/>);",resolveDir:root,sourcefile:'local-entry.tsx',loader:'tsx'},bundle:true,outdir:out,entryNames:'dashboard',assetNames:'[name]-[hash]',format:'esm',platform:'browser',target:['es2022'],minify:true,define:{'process.env.NODE_ENV':'"production"'},tsconfig:path.join(root,'tsconfig.json'),logLevel:'warning'});
const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0d0b12"><title>Perpl Pulse · Protocol & Wallet Intelligence</title><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/dashboard.css"></head><body><div id="root"></div><script type="module" src="/dashboard.js"></script></body></html>';
const handler=async(req,res)=>{try{
 const host=req.headers.host||'';if(!['127.0.0.1:'+port,'localhost:'+port,'[::1]:'+port].includes(host)){res.writeHead(403);res.end('Invalid host');return}
 const url=new URL(req.url,'http://'+host);
 if(url.pathname.startsWith('/api/local/')){
  const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
  if(req.headers['sec-fetch-site']==='cross-site')return json(403,{error:'Local access only'});
  if(req.method==='POST'&&url.pathname==='/api/local/indexer'){
   if(req.headers.origin!==url.origin)return json(403,{error:'Same-origin request required'});
   let body='';for await(const chunk of req){body+=chunk;if(body.length>256)return json(413,{error:'Request too large'});}
   return json(410,{error:'Raw historical backfill is disabled in summary mode. Existing checkpoints are preserved.'});
  }
  if(req.method!=='GET')return json(405,{error:'Unsupported method'});
  if(url.pathname==='/api/local/status')return json(200,summaryStore.view().coverage);
  if(url.pathname==='/api/local/protocol')return json(200,summaryStore.view());
  if(url.pathname==='/api/local/liquidations')return json(200,{rows:summaryStore.liquidations(),markets:await summaries.liquidationMarkets().catch(()=>[]),partial:true});
  if(url.pathname==='/api/local/funding-history'){const id=url.searchParams.get('market')||'1';if(!/^\d{1,8}$/.test(id))return json(400,{error:'Invalid market'});return json(200,await summaries.fundingHistory(id));}
  if(url.pathname==='/api/local/observations')return json(200,{rows:summaryStore.observations()});
  if(url.pathname==='/api/local/leaderboard')return json(200,await summaries.publicRead('/v1/trading/leaderboard/all/vol'));
  if(url.pathname==='/api/local/market-snapshot')return json(200,await summaries.publicRead('/v1/pub/context'));
  const match=url.pathname.match(/^\/api\/local\/wallet\/(0x[a-fA-F0-9]{40})$/);
  if(match){const kind=url.searchParams.get('kind')||'all',page=Number(url.searchParams.get('page')||0),through=url.searchParams.has('through')?Number(url.searchParams.get('through')):undefined;
   if(!['all','trades','pnl','flows'].includes(kind)||!Number.isSafeInteger(page)||page<0||page>100000||(through!==undefined&&(!Number.isSafeInteger(through)||through<0||through>=indexer.store.get('next'))))return json(400,{error:'Invalid history query'});
   try{const address=match[1].toLowerCase();const [wallet,leaderboard]=await Promise.all([indexer.wallet(address,kind,page,through,{currentOnly:true,force:url.searchParams.get('refresh')==='1'}),summaries.leaderboard(address).catch(()=>({error:'Perpl leaderboard unavailable; historical PnL is not estimated.'}))]);return json(200,{...wallet,leaderboard});}catch(e){return json(502,{error:e.message});}
  }
  return json(404,{error:'Unknown local endpoint'});
 }
 if(req.method!=='GET'){res.writeHead(405,{'Allow':'GET'});res.end('Read-only server');return}
 if(url.pathname==='/healthz'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({app:'perpl-pulse',status:'ok',pid:process.pid}));return}
 if(url.pathname.startsWith('/api/perpl/')){
 if(/^\/api\/perpl\/v1\/market-data\/\d+\/candles\/(60|300|900|1800|3600|7200|14400|28800|43200|86400)\/\d+-\d+$/.test(url.pathname)&&!url.search){
  const range=url.pathname.match(/\/(\d+)-(\d+)$/);if(Number(range[1])<Date.UTC(2026,1,1)||Number(range[2])<Number(range[1])){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'History begins February 2026; invalid time window'}));return;}
  const result=await summaries.publicRead(url.pathname.replace('/api/perpl',''));res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store','X-Snapshot-Time':String(result.at),'X-Snapshot-Stale':String(result.stale)});res.end(JSON.stringify({...result.data,_snapshotAt:result.at,_stale:result.stale}));return;
 }
 const headers=new Headers();for(const k of ['X-API-Key','X-API-Timestamp','X-API-Nonce','X-API-Signature']){const v=req.headers[k.toLowerCase()];if(typeof v==='string')headers.set(k,v)}
 const response=await GET(new Request(url,{headers}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return
 }
 if(url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html);return}
 const assets={'/dashboard.js':['dashboard.js','text/javascript; charset=utf-8'],'/dashboard.css':['dashboard.css','text/css; charset=utf-8'],'/favicon.svg':[path.join(root,'public','favicon.svg'),'image/svg+xml']};
 const asset=assets[url.pathname];if(!asset){res.writeHead(404);res.end('Not found');return}
 const content=await readFile(path.isAbsolute(asset[0])?asset[0]:path.join(out,asset[0]));res.writeHead(200,{'Content-Type':asset[1],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(content)
 }catch{res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Local dashboard request failed'}))}};
const server=createServer(handler),ipv6=createServer(handler);
const listen=(s,p,host)=>new Promise((resolve,reject)=>{s.once('error',reject);s.listen(p,host,()=>{s.removeListener('error',reject);resolve(s.address())})});
function probe(url){return new Promise((resolve,reject)=>{const request=get(url,{agent:false},response=>{let body='';response.setEncoding('utf8');response.on('data',chunk=>body+=chunk);response.on('end',()=>response.statusCode===200?resolve(body):reject(Error('HTTP '+response.statusCode)))});request.setTimeout(5000,()=>request.destroy(Error('HTTP health check timed out')));request.on('error',reject)})}
try{
 const binding=await listen(server,requestedPort,'127.0.0.1');port=binding.port;
 let hasIPv6=false;try{await listen(ipv6,port,'::1');hasIPv6=true}catch(error){await log('IPv6 unavailable: '+error.code)}
 const base='http://localhost:'+port;
 await probe('http://127.0.0.1:'+port+'/healthz');
 if(hasIPv6)await probe('http://[::1]:'+port+'/healthz');
 const page=await probe(base+'/');if(!page.includes('Perpl Pulse'))throw Error('Dashboard page validation failed');
 await log('VERIFIED HTTP 200: '+base);
 await log('IPv4: http://127.0.0.1:'+port+(hasIPv6?' | IPv6: http://[::1]:'+port:''));
 await log('Keep this window open. Connection log: '+diagnosticFile);
 if(process.argv.includes('--open')){
  const browser=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Start-Process -FilePath '"+base+"'"],{windowsHide:true,stdio:'ignore'});
  browser.on('error',error=>log('Could not open browser: '+error.message));
 }
}catch(error){await log('STARTUP FAILED: '+error.message);indexer.stop();server.close();ipv6.close();process.exitCode=1}
server.on('error',error=>log('Server error: '+error.message));
ipv6.on('error',error=>log('IPv6 error: '+error.message));
function stop(){summaries.stop();indexer.stop();server.close();ipv6.close();setTimeout(()=>process.exit(0),250);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);

