import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,existsSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

// Run the real interactive setup with deterministic transport responses. Both
// failure paths must stop before writing credentials or touching saved history.
const script=new URL('../scripts/setup-spectrum.mjs',import.meta.url).href;
const envFile=new URL('../.env',import.meta.url);
const before=existsSync(envFile)?readFileSync(envFile):null;
const dir=mkdtempSync(path.join(tmpdir(),'perpl-setup-fresh-'));
try{
for(const scenario of ['history','auth']){
 const code=`
 globalThis.fetch=async(url,options)=>{
   const b=JSON.parse(options.body);
   if(${JSON.stringify(scenario)}==='auth')return new Response('',{status:403});
   if(b.method==='rpcProxy')throw Error('Unexpected API fallback');
   let result=null;
   if(b.method==='eth_chainId')result='0x8f';
   if(b.method==='eth_getBlockByNumber'&&b.params[0]==='latest')result={number:'0x7000000'};
   if(b.method==='eth_getLogs')result=[];
   return new Response(JSON.stringify({jsonrpc:'2.0',id:b.id,result}));
 };
 await import(${JSON.stringify(script)});
 `;
 const run=spawnSync(process.execPath,['--input-type=module','-e',code],{input:'https://example.invalid/PRIVATE_SETUP_CREDENTIAL\n',encoding:'utf8',timeout:10000,env:{...process.env,PERPL_DATA_DIR:dir}});
 assert.equal(run.status,1,run.stderr);
 const output=run.stdout+run.stderr;
 assert.ok(!output.includes('PRIVATE_SETUP_CREDENTIAL'));
 assert.match(output,/Existing history and provider settings are retained/);
 if(scenario==='history'){
   assert.match(output,/PASS: Monad mainnet/);
   assert.match(output,/Resume log probe: 0 logs/);
   assert.match(output,/Setup failed at History boundary/);
   assert.match(output,/eth_getBlockByNumber for block 54773010/);
 }else{
   assert.match(output,/HTTP 403/);
   assert.ok(!output.includes('testing the unified API'));
 }
}
}finally{assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));rmSync(dir,{recursive:true,force:true});}
assert.deepEqual(existsSync(envFile)?readFileSync(envFile):null,before);
console.log('PASS: actual setup reports missing February block/log probe and authentication failure, without credentials in output or configuration changes.');
