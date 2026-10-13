import {createInterface} from 'node:readline';
import {Writable} from 'node:stream';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readResumePoint} from '../indexer/resume-point.mjs';
import {findSpectrumStart} from '../indexer/spectrum-retention.mjs';
import assert from 'node:assert/strict';
import {SpectrumRpc,SpectrumBackfill,endpointUrl} from '../indexer/spectrum.mjs';
import {Rpc,DEPLOYMENT_BLOCK,HISTORY_START,EXCHANGE,topics,hex,decodeLogs} from '../indexer/chain.mjs';
const configFile=new URL('../.env',import.meta.url);
try{process.loadEnvFile(fileURLToPath(configFile));}catch(e){if(e.code!=='ENOENT')throw e;}

console.log('Perpl Pulse: Spectrum Business setup');
console.log('Copy your Monad MAINNET HTTPS RPC endpoint from Spectrum.');
console.log('A PRUNED endpoint can be tested; historical blocks and logs must be available.');
console.log('The unified Spectrum API endpoint also works through rpcProxy.');
console.log('Your endpoint contains a credential. It is saved only in the local .env.');
const output=new Writable({write(chunk,encoding,done){done();}}),rl=createInterface({input:process.stdin,output,terminal:process.stdin.isTTY});
rl.on('SIGINT',()=>process.exit(1));process.stdout.write('Paste the full endpoint URL (hidden), then press Enter: ');
const input=(await new Promise(resolve=>rl.question('',resolve))).trim();rl.close();
let stage='Endpoint validation';
let point;
const mixed=process.argv.includes('--parallel');
let spectrumStart;
try{
  let endpoint=endpointUrl(input),mode='rpc',client=new SpectrumRpc(endpoint,{rps:10}),chain;
  console.log('\nChecking endpoint format and Monad access...');
  try{chain=await client.call('eth_chainId',[]);}catch(directError){
    // Do not disguise an authentication, quota or network failure by changing URL.
    if(!/method unavailable|missing result|no result|Invalid Spectrum|Spectrum RPC error/.test(directError.message))throw directError;
    console.log('Direct RPC format not accepted; testing the unified API format...');
    const originalClient=new SpectrumRpc(endpoint,{mode:'api',rps:10});
    try{chain=await originalClient.call('eth_chainId',[]);client=originalClient;mode='api';}
    catch{
    const u=new URL(endpoint);if(!u.pathname.replace(/\/$/,'').endsWith('/v1'))u.pathname=u.pathname.replace(/\/$/,'')+'/v1';
    endpoint=u.href;mode='api';client=new SpectrumRpc(endpoint,{mode,rps:10});
    try{chain=await client.call('eth_chainId',[]);}catch(apiError){throw Error('Endpoint detection failed. Direct RPC: '+directError.message+' API: '+apiError.message);}
    }
  }
  if(Number(BigInt(chain))!==143)throw Error('This endpoint is not Monad mainnet (chain 143).');
  console.log('PASS: Monad mainnet, chain 143 ('+mode+' mode).');
  stage='Latest block';console.log('Checking latest block access...');
  const latest=await client.block(),publicRpc=new Rpc(undefined,100);
  console.log('PASS: latest block '+Number(BigInt(latest.number))+'.');
  stage='Reading saved checkpoint';
  const dbPath=path.join(process.env.PERPL_DATA_DIR||fileURLToPath(new URL('../.perpl-data/',import.meta.url)),'index.sqlite');
  point=readResumePoint(dbPath);
  if(point.hash)console.log('Saved history through '+new Date(point.time).toISOString()+' (block '+point.verifyBlock+'). Resume at block '+point.next+'.');
  else console.log(mixed?'No saved history: HyperSync will start at the February deployment.':'No saved history: February deployment access is required.');
  const head=Number(BigInt(latest.number))-64;
  if(head<point.verifyBlock)throw Error('Spectrum endpoint is behind the saved checkpoint.');
  if(mixed){
    if(!process.env.ENVIO_API_TOKEN)throw Error('Parallel mode needs your saved HyperSync token to fill the historical gap');
    stage='Spectrum retention search';console.log('Locating Spectrum retention and a buffered start (confirmed head '+head+')...');
    const found=await findSpectrumStart(client,publicRpc,Math.min(point.next,head),head,(n,ok)=>console.log('Probe block '+n+': '+(ok?'block and logs verified':'unavailable')));
    spectrumStart=found.start;
    console.log('Approximate retention boundary: '+found.boundaryLower+'-'+found.boundaryUpper+'.');
    console.log('Verified Spectrum start with safety buffer: '+found.start+' ('+new Date(found.time).toISOString()+').');
    console.log('Buffer: '+found.marginBlocks+' blocks beyond the tested boundary. HyperSync will cover this extra gap.');
    console.log('HyperSync continues from '+point.next+'. Newer Spectrum batches are saved separately until the gap closes.');
  }else{
  stage='History boundary';console.log('Checking '+(point.hash?'saved checkpoint':'February deployment')+' block '+point.verifyBlock+'...');
  let boundary;
  try{boundary=await client.block(point.verifyBlock);}catch(e){
    console.log('Boundary block check failed. Testing event-log access at the resume point separately...');
    try{
      const logs=await client.call('eth_getLogs',[{address:EXCHANGE,topics:[topics],fromBlock:hex(point.next),toBlock:hex(point.next+10)}]);
      console.log('Resume log probe: '+(Array.isArray(logs)?logs.length+' logs returned. An empty response does not prove historical coverage.':'unexpected response format.'));
    }catch(logError){console.log('Resume log probe failed: '+logError.message);}
    throw e;
  }
  if(Number(BigInt(boundary.number))!==point.verifyBlock||Number(BigInt(boundary.timestamp))*1000<HISTORY_START)throw Error('History boundary verification failed.');
  if(point.hash&&boundary.hash!==point.hash)throw Error('Saved checkpoint hash does not match Spectrum. Configuration was not changed.');
  console.log('PASS: history boundary'+(point.hash?' matches the saved block hash.':' is available.'));
  }
  const sampleStart=spectrumStart??Math.min(point.next,head),recentStart=Math.max(sampleStart,head-1000000);
  const samples=[{start:sampleStart,end:Math.min(head,sampleStart+49)}];
  if(recentStart>samples[0].end)samples.push({start:recentStart,end:Math.min(head,recentStart+49)});
  const scanner=new SpectrumBackfill(client,{workers:1,window:1000});
  for(const sample of samples){
    stage='Spectrum historical events '+sample.start+'-'+sample.end;console.log('Checking '+stage+'...');
    const t=Date.now(),actual=await scanner.range(sample);
    stage='Public RPC comparison '+sample.start+'-'+sample.end;
    const logs=await publicRpc.call('eth_getLogs',[{address:EXCHANGE,topics:[topics],fromBlock:hex(sample.start),toBlock:hex(sample.end)}]);
    const times=new Map();for(const l of logs)if(!l.blockTimestamp){const n=Number(BigInt(l.blockNumber));if(!times.has(n))times.set(n,Number(BigInt((await publicRpc.block(n)).timestamp))*1000);}
    try{assert.deepEqual(actual.rows,decodeLogs(logs,times));}catch{throw Error('Spectrum/public RPC event comparison failed. Configuration was not changed.');}
    console.log('Verified '+(sample.end-sample.start+1)+' blocks, '+actual.rows.length+' matching events ('+(Date.now()-t)+' ms including comparison).');
  }
  if(process.argv.includes('--check-only')){console.log('Validation passed (check-only); configuration was not changed.');process.exit(0);}
  stage='Saving local settings';
  const file=configFile;let old='';try{old=readFileSync(file,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
  const settings={SPECTRUM_ENDPOINT:endpoint,SPECTRUM_MODE:mode,SPECTRUM_RPS:'10',SPECTRUM_WORKERS:'2',SPECTRUM_WINDOW_BLOCKS:'100',PERPL_HISTORY_SOURCE:mixed?'mixed':'spectrum',...(mixed?{SPECTRUM_START_BLOCK:String(spectrumStart)}:{})};
  for(const key of Object.keys(settings))old=old.replace(new RegExp('^\\s*(?:export\\s+)?'+key+'\\s*=.*\\r?\\n?','gm'),'');
  writeFileSync(file,old.trimEnd()+'\n'+Object.entries(settings).map(([k,v])=>k+'='+JSON.stringify(v)).join('\n')+'\n',{mode:0o600});
  console.log('Saved. Spectrum '+mode+' mode: 2 fetchers, up to 10 requests/second for backfill; automatic slowdown on throttling.');
  console.log('Existing history and HyperSync credentials are preserved. Spectrum uses your existing plan credits.');
  console.log('Close the old launcher and run Start Perpl Pulse.cmd. '+(mixed?'The panel will show HyperSync gap filling and a separate Spectrum range.':'The panel should show Spectrum.'));
}catch(e){
  const message=String(e.message);
  console.error('Setup failed at '+stage+': '+(message.includes('https://')||message.includes(input)&&input?'Endpoint validation failed; check the URL, historical access and IP allowlist.':message));
  if(stage==='History boundary')console.error('Spectrum must serve the saved boundary block '+point.verifyBlock+' and logs from '+point.next+' onward. Earlier saved history does not need to be downloaded again. No blocks will be skipped.');
  console.error('Setup did not activate Spectrum. Existing history and provider settings are retained.');
  process.exitCode=1;
}
