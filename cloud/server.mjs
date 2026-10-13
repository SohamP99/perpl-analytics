import {createServer} from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {PostgresStore} from './postgres-store.mjs';
import {decodeSeed,importSeed} from './seed.mjs';
import {runJob} from './job.mjs';
import {CloudWallet} from './wallet.mjs';
import {SummaryEngine} from '../indexer/summary-engine.mjs';
import {targetFor} from './routes.mjs';
export function authorized(header,secret){if(typeof secret!=='string'||secret.length<32||typeof header!=='string')return false;const a=Buffer.from(header),b=Buffer.from('Bearer '+secret);return a.length===b.length&&timingSafeEqual(a,b);}
export function createHandler({store,publicData,wallet,readToken,jobToken,job=()=>runJob(store,{snapshot:()=>publicData.publicRead('/v1/pub/context')})}){
 let busy=false;
 return async(req,res)=>{
  const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
  try{
   const url=new URL(req.url,'http://localhost');
   if(req.method==='GET'&&(url.pathname==='/healthz'||url.pathname==='/'))return send(200,{app:'perpl-pulse',status:'ok',service:'data-backend'});
   if(url.pathname==='/jobs/refresh'){
    if(!authorized(req.headers.authorization,jobToken))return send(401,{error:'Unauthorized'});
    if(req.method!=='POST')return send(405,{error:'Use POST'});
    if(busy)return send(202,{status:'busy'});busy=true;
    try{const result=await job();return send(result.status==='retrying'?503:200,result);}finally{busy=false;}
   }
   if(!authorized(req.headers.authorization,readToken))return send(401,{error:'Unauthorized'});
   if(req.method!=='GET')return send(405,{error:'Read-only API'});
   let valid;try{valid=targetFor(req.url,'https://backend.invalid');}catch{return send(404,{error:'Unsupported API path'});}
   if(valid.pathname==='/api/local/status')return send(200,(await store.view()).coverage);
   if(valid.pathname==='/api/local/protocol')return send(200,await store.view());
   if(valid.pathname==='/api/local/liquidations')return send(200,{rows:await store.liquidations(),markets:await publicData.liquidationMarkets().catch(()=>[]),partial:true});
   if(valid.pathname==='/api/local/market-snapshot')return send(200,await publicData.publicRead('/v1/pub/context'));
   if(valid.pathname==='/api/local/leaderboard')return send(200,await publicData.publicRead('/v1/trading/leaderboard/all/vol'));
   if(valid.pathname==='/api/local/funding-history'){const id=url.searchParams.get('market')||'1';if(!/^\d{1,8}$/.test(id))return send(400,{error:'Invalid market'});return send(200,await publicData.fundingHistory(id));}
   const match=valid.pathname.match(/^\/api\/local\/wallet\/(0x[a-fA-F0-9]{40})$/);
   if(match){const address=match[1].toLowerCase(),[current,leaderboard]=await Promise.all([wallet.read(address,url.searchParams.get('refresh')==='1'),publicData.leaderboard(address).catch(()=>({error:'Perpl leaderboard unavailable; historical PnL is not estimated.'}))]);return send(200,{...current,leaderboard});}
   if(valid.pathname.startsWith('/api/perpl/')){
    const range=valid.pathname.match(/\/(\d+)-(\d+)$/);if(Number(range[1])<Date.UTC(2026,1,1)||Number(range[2])<Number(range[1])||Number(range[2])>Date.now()+86400000)return send(400,{error:'Invalid history window'});
    const result=await publicData.publicRead(valid.pathname.replace('/api/perpl',''));return send(200,{...result.data,_snapshotAt:result.at,_stale:result.stale});
   }
   return send(404,{error:'Not found'});
  }catch{return send(502,{error:'Cloud data service is temporarily unavailable'});}
 };
}
export async function main(){
 const readToken=process.env.PERPL_BACKEND_TOKEN,jobToken=process.env.PERPL_JOB_TOKEN;
 if(!readToken||!jobToken||readToken.length<32||jobToken.length<32||readToken===jobToken)throw Error('Configure distinct backend and job tokens, at least 32 characters each');
 if(!process.env.DATABASE_URL&&!process.env.PGHOST)throw Error('Configure the Starter Tier PostgreSQL connection');
 const pool=new pg.Pool({...(process.env.DATABASE_URL?{connectionString:process.env.DATABASE_URL}:{}),max:4,idleTimeoutMillis:10000,connectionTimeoutMillis:8000,statement_timeout:4000});
 const store=new PostgresStore(pool);await store.init();
 if(!await store.get('cloudSeed')){const manifest=JSON.parse(readFileSync(new URL('./seed-manifest.json',import.meta.url),'utf8'));let bytes;try{bytes=readFileSync(new URL('./seed.json.gz',import.meta.url));}catch(e){if(e.code!=='ENOENT')throw e;bytes=Buffer.from(JSON.parse(readFileSync(new URL('./seed-data.json',import.meta.url),'utf8')).base64,'base64');}await importSeed(store,decodeSeed(bytes,manifest.sha256),manifest.sha256);}
 const publicData=new SummaryEngine(store),wallet=new CloudWallet(store,publicData);
 const server=createServer(createHandler({store,publicData,wallet,readToken,jobToken}));server.requestTimeout=60000;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(Number(process.env.PORT||8080),'0.0.0.0',resolve);});
 console.log('Perpl Pulse cloud backend ready');
 process.on('SIGTERM',()=>server.close(()=>store.close().finally(()=>process.exit(0))));
 return server;
}
if(process.argv[1]===fileURLToPath(import.meta.url))main().catch(()=>{console.error('Cloud backend startup failed; check database configuration and seed integrity');process.exitCode=1;});
