import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const dir=mkdtempSync(path.join(tmpdir(),'perpl-server-test-'));
const child=spawn(process.execPath,['scripts/local-dashboard.mjs'],{env:{...process.env,PERPL_LOCAL_PORT:'0',PERPL_DATA_DIR:dir,PERPL_INDEXER_DISABLED:'1',PERPL_SUMMARY_REFRESH_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
try{
 const url=await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(Error('Startup timed out')),30000);child.stdout.on('data',chunk=>{text+=chunk;const m=text.match(/VERIFIED HTTP 200: (http:\/\/localhost:\d+)/);if(m){clearTimeout(timer);resolve(m[1])}});child.on('exit',code=>{clearTimeout(timer);reject(Error('Server exited: '+code))});child.stderr.on('data',chunk=>process.stderr.write(chunk))});
 const health=await fetch(url+'/healthz',{signal:AbortSignal.timeout(5000)});assert.equal(health.status,200);assert.equal((await health.json()).app,'perpl-pulse');
 const page=await fetch(url);assert.equal(page.status,200);assert.match(await page.text(),/Perpl Pulse/);
 for(const asset of ['/dashboard.js','/dashboard.css']){const r=await fetch(url+asset);assert.equal(r.status,200);assert.ok((await r.text()).length>100)}
 const privateRead=await fetch(url+'/api/perpl/v1/trading/wallet');assert.equal(privateRead.status,401);
 const context=await fetch(url+'/api/perpl/v1/pub/context',{signal:AbortSignal.timeout(20000)});assert.equal(context.status,200);assert.ok((await context.json()).markets.length>0);
 const status=await (await fetch(url+'/api/local/status')).json();assert.equal(status.mode,'summaries');assert.equal(status.fromBlock,54773010);assert.equal(status.nextBlock,112892174);assert.equal(status.historicalImported,false);
 const rejected=await fetch(url+'/api/local/indexer',{method:'POST',headers:{Origin:'https://untrusted.example','Content-Type':'application/json'},body:'{"paused":true}'});assert.equal(rejected.status,403);
 const pause=await fetch(url+'/api/local/indexer',{method:'POST',headers:{Origin:url,'Content-Type':'application/json'},body:'{"paused":true}'});assert.equal(pause.status,410);
 const beforeLaunch=await fetch(url+'/api/perpl/v1/market-data/1/candles/86400/1700000000000-1790000000000');assert.equal(beforeLaunch.status,400);
 const wallet=await fetch(url+'/api/local/wallet/0xcfe9d433b70e95ac2935f118c2e11007fb64b477',{signal:AbortSignal.timeout(60000)});assert.equal(wallet.status,200);const w=await wallet.json();assert.equal(w.account,'1');assert.equal(typeof w.balance,'number');assert.equal(w.history,undefined);assert.equal(w.stats,undefined);
 const nonexistent=await fetch(url+'/api/local/wallet/0x0000000000000000000000000000000000000000');assert.equal(nonexistent.status,200);assert.equal((await nonexistent.json()).account,'0');
 const invalid=await fetch(url+'/api/local/wallet/0xcfe9d433b70e95ac2935f118c2e11007fb64b477?page=-1');assert.equal(invalid.status,400);
 console.log('PASS: independent-process HTTP, HTML, JavaScript, CSS, auth rejection and live public API relay.');
 console.log('PASS: wallet snapshots without history, missing account, summary coverage, disabled old backfill, invalid pagination and pre-February history rejection.');
}finally{child.kill();await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));rmSync(dir,{recursive:true,force:true});}
