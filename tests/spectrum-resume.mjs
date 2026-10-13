import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,existsSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Store} from '../indexer/store.mjs';
import {DEPLOYMENT_BLOCK} from '../indexer/chain.mjs';
import {resumePoint} from '../indexer/resume-point.mjs';
import {SpectrumRpc,SpectrumBackfill} from '../indexer/spectrum.mjs';
import {Indexer} from '../indexer/service.mjs';

const script=new URL('../scripts/setup-spectrum.mjs',import.meta.url).href;
const envFile=new URL('../.env',import.meta.url);
const before=existsSync(envFile)?readFileSync(envFile):null;
const july=86000000,hash='0x'+'a'.repeat(64),stamp=1783008000;
assert.throws(()=>resumePoint(july,null),/inconsistent/);
assert.throws(()=>resumePoint(july,{start:DEPLOYMENT_BLOCK,end:july-2,hash,time:stamp*1000}),/inconsistent/);
function provider(scenario){return async(url,options)=>{
 const b=JSON.parse(options.body);let result=null;
 if(b.method==='eth_chainId')result='0x8f';
 if(b.method==='eth_getBlockByNumber'){
  const n=b.params[0]==='latest'?86000000+100000:Number(BigInt(b.params[0]));
  if(n<86000000-1)throw Error('Requested already saved February history');
  if(b.params[0]==='latest'||scenario!=='missing')result={number:'0x'+n.toString(16),hash:'0x'+(scenario==='mismatch'?'b':'a').repeat(64),parentHash:'0x'+'a'.repeat(64),timestamp:'0x'+(1783008000).toString(16)};
 }
 if(b.method==='eth_getLogs'){
  if(Number(BigInt(b.params[0].fromBlock))<86000000)throw Error('Requested saved history logs');
  result=[];
 }
 return new Response(JSON.stringify({jsonrpc:'2.0',id:b.id,result}));
};}
for(const scenario of ['resume','missing','mismatch']){
 const dir=mkdtempSync(path.join(tmpdir(),'perpl-spectrum-resume-'));
 try{
  const store=new Store(path.join(dir,'index.sqlite'));store.commit(DEPLOYMENT_BLOCK,july-1,hash,stamp*1000,[]);store.close();
  const code=`globalThis.fetch=(${provider.toString()})(${JSON.stringify(scenario)});await import(${JSON.stringify(script)});`;
  const run=spawnSync(process.execPath,['--input-type=module','-e',code,'--','--check-only'],{input:'https://example.invalid/PRIVATE_SETUP_CREDENTIAL\n',encoding:'utf8',timeout:15000,env:{...process.env,PERPL_DATA_DIR:dir}});
  assert.equal(run.status,scenario==='resume'?0:1,run.stdout+run.stderr);
  const output=run.stdout+run.stderr;assert.ok(!output.includes('PRIVATE_SETUP_CREDENTIAL'));
  if(scenario==='resume'){
   assert.match(output,/matches the saved block hash/);assert.match(output,/Validation passed \(check-only\)/);
  }else{
   assert.match(output,/Existing history and provider settings are retained/);
   assert.match(output,scenario==='missing'?/eth_getBlockByNumber for block 85999999/:/checkpoint hash does not match/);
  }
  const client=new SpectrumRpc('https://example.invalid/PRIVATE_SETUP_CREDENTIAL',{fetcher:provider(scenario==='mismatch'?'missing':scenario),rps:150});
  const worker=new Indexer({dataDir:dir,rpc:client,liveRpc:client,hypersync:null});
  try{
   worker.parallel=new SpectrumBackfill(client,{workers:2,window:2});
   await worker.tick();clearTimeout(worker.timer);
   assert.equal(worker.store.get('next'),scenario==='resume'?july+4:july,worker.store.get('error'));
   assert.equal(worker.store.lastBatch().hash,hash);
  }finally{worker.stop();worker.store.close();}
 }finally{assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));rmSync(dir,{recursive:true,force:true});}
}
assert.deepEqual(existsSync(envFile)?readFileSync(envFile):null,before);
console.log('PASS: setup and worker resume with July-only provider; missing checkpoint and setup hash mismatch retain history/settings; no February queries or skipped blocks.');
