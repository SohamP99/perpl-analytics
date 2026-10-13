import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Store} from '../indexer/store.mjs';
const dir=mkdtempSync(path.join(tmpdir(),'perpl-worker-server-'));
// Seed only this disposable test database at a known active historical range.
const sampleStart=86000000,seed=new Store(path.join(dir,'index.sqlite'));seed.set('next',sampleStart);seed.close();
const child=spawn(process.execPath,['scripts/local-dashboard.mjs'],{env:{...process.env,PERPL_LOCAL_PORT:'0',PERPL_DATA_DIR:dir,PERPL_INDEXER_DISABLED:'0',PERPL_BACKFILL_WORKERS:'3'},stdio:['ignore','pipe','pipe']});
try{
 const url=await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(Error('Startup timed out')),30000);child.stdout.on('data',chunk=>{text+=chunk;const m=text.match(/VERIFIED HTTP 200: (http:\/\/localhost:\d+)/);if(m){clearTimeout(timer);resolve(m[1]);}});child.once('exit',()=>{clearTimeout(timer);reject(Error('Server exited'));});});
 let status,healthChecks=0;
 for(let i=0;i<90;i++){
   const t=Date.now();assert.equal((await fetch(url+'/healthz',{signal:AbortSignal.timeout(3000)})).status,200);assert.ok(Date.now()-t<3000);healthChecks++;
   status=await(await fetch(url+'/api/local/status')).json();
   if(status.indexedThrough>=sampleStart+10499)break;
   if(status.error&&!/rate limit|cooling down/i.test(status.error))throw Error(status.error);
   await new Promise(r=>setTimeout(r,1000));
 }
 assert.equal(status.workers,3);assert.ok(status.indexedThrough>=sampleStart+10499);assert.ok(status.events>0);
 const summary=await(await fetch(url+'/api/local/protocol')).json();assert.ok(summary.coverage.events>0);
 console.log(JSON.stringify({test:'live parallel worker + responsive HTTP',healthChecks,workers:status.workers,events:status.events,indexedBlocks:status.indexedThrough-sampleStart+1}));
}finally{child.kill();await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));rmSync(dir,{recursive:true,force:true});}
