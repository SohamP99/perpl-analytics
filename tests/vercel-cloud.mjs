import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {PGlite} from '@electric-sql/pglite';
import {privatePool} from '../cloud/database.mjs';
import {PostgresStore} from '../cloud/postgres-store.mjs';
import {createHandler} from '../cloud/server.mjs';
import {createVercelHandler} from '../cloud/vercel.mjs';
const pg=new PGlite(),raw={query:async(sql,args)=>!args&&sql.split(';').filter(s=>s.trim()).length>1?(await pg.exec(sql)).at(-1):pg.query(sql,args),connect:async()=>({...raw,release(){}}),end:()=>pg.close()};
const pool=await privatePool(raw),store=new PostgresStore(pool);await store.init();
assert.equal((await raw.query("SELECT schemaname FROM pg_tables WHERE tablename='settings'")).rows[0].schemaname,'perpl');
await raw.query('CREATE ROLE anonymous_test');
assert.equal((await raw.query("SELECT has_schema_privilege('anonymous_test','perpl','USAGE') AS allowed")).rows[0].allowed,false);
const env={DATABASE_URL:'configured',PERPL_BACKEND_TOKEN:'r'.repeat(40),PERPL_JOB_TOKEN:'j'.repeat(40)};
let jobs=0,initializations=0;
const handler=createHandler({store,publicData:{fundingHistory:async market=>({market})},wallet:{},readToken:env.PERPL_BACKEND_TOKEN,jobToken:env.PERPL_JOB_TOKEN,job:async()=>{jobs++;return {status:'caught-up'};}});
const server=createServer(createVercelHandler({env,get:async()=>{initializations++;return {handler};}}));
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
try{
 for(const [path,method,code] of [['/api/refresh','POST',401],['/api/local/protocol','POST',405],['/api/proxy?path=../jobs/refresh','GET',400]])assert.equal((await fetch(base+path,{method})).status,code);
 assert.equal(initializations,0,'invalid or unauthorized requests must not initialize the database');
 let response=await fetch(base+'/api/local/protocol');assert.equal(response.status,200);assert.ok((await response.json()).coverage);
 response=await fetch(base+'/api/proxy?path=local%2Ffunding-history&market=2');assert.deepEqual(await response.json(),{market:'2'});
 response=await fetch(base+'/api/refresh',{method:'POST',headers:{Authorization:'Bearer '+env.PERPL_BACKEND_TOKEN}});assert.equal(response.status,401);assert.equal(jobs,0);
 response=await fetch(base+'/api/refresh',{method:'POST',headers:{Authorization:'Bearer '+env.PERPL_JOB_TOKEN}});assert.equal(response.status,200);assert.equal(jobs,1);
 assert.equal((await fetch(base+'/api/local/indexer')).status,400);
 console.log('PASS: private PostgreSQL schema, public read routes, Vercel query rewrites, independent authenticated scheduler, pre-initialization access checks.');
}finally{await new Promise(r=>server.close(r));await store.close();}
