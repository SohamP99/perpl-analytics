import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Store} from '../indexer/store.mjs';
import {DEPLOYMENT_BLOCK} from '../indexer/chain.mjs';
const dir=mkdtempSync(path.join(tmpdir(),'perpl-probe-setup-'));
const envFile=new URL('../.env',import.meta.url),before=readFileSync(envFile);
try{
 const store=new Store(path.join(dir,'index.sqlite'));
 store.commit(DEPLOYMENT_BLOCK,85999999,'0x'+'a'.repeat(64),1783008000000,[]);store.close();
 const code=`globalThis.fetch=async(url,o)=>{
  const b=JSON.parse(o.body);let result=null;
  if(b.method==='eth_chainId')result='0x8f';
  if(b.method==='eth_getBlockByNumber'){
   const n=b.params[0]==='latest'?86100000:Number(BigInt(b.params[0]));
   if(!url.includes('example.invalid')||n>=86050000)result={number:'0x'+n.toString(16),hash:'0x'+'a'.repeat(64),parentHash:'0x'+'a'.repeat(64),timestamp:'0x'+(1783008000).toString(16)};
  }
  if(b.method==='eth_getLogs')result=[];
  return new Response(JSON.stringify({jsonrpc:'2.0',id:b.id,result}));
 };await import(${JSON.stringify(new URL('../scripts/setup-spectrum.mjs',import.meta.url).href)});`;
 const run=spawnSync(process.execPath,['--input-type=module','-e',code,'--','--parallel','--check-only'],{input:'https://example.invalid/PRIVATE_TOKEN\n',encoding:'utf8',timeout:30000,env:{...process.env,PERPL_DATA_DIR:dir,ENVIO_API_TOKEN:'test-only'}});
 assert.equal(run.status,0,run.stdout+run.stderr);
 const selected=Number(run.stdout.match(/Verified Spectrum start with safety buffer: (\d+)/)?.[1]);
 assert.ok(selected>=86060000&&selected<=86061000,run.stdout);
 assert.match(run.stdout,/HyperSync will cover this extra gap/);
 assert.match(run.stdout,/HyperSync continues from 86000000/);
 assert.match(run.stdout,/Validation passed \(check-only\)/);
 assert.ok(!(run.stdout+run.stderr).includes('PRIVATE_TOKEN'));
 assert.deepEqual(readFileSync(envFile),before);
 console.log('PASS: real parallel setup probes retention, selects newer Spectrum start, retains July gap and does not expose credentials or mutate config in check-only mode.');
}finally{assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));rmSync(dir,{recursive:true,force:true});}
