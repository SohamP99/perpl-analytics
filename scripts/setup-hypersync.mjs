import {createInterface} from 'node:readline';
import {Writable} from 'node:stream';
import {readFileSync,writeFileSync} from 'node:fs';
import {HyperSync} from '../indexer/hypersync.mjs';
import {DEPLOYMENT_BLOCK} from '../indexer/chain.mjs';
import {verifyHyperSync} from '../indexer/verify-hypersync.mjs';

console.log('Perpl Pulse: free HyperSync setup');
console.log('Create a FREE HyperSync token at https://envio.dev/app/api-tokens');
console.log('This developer token stays in your local .env, outside browser code and source archives.');
const output=new Writable({write(chunk,encoding,done){done();}});
const rl=createInterface({input:process.stdin,output,terminal:process.stdin.isTTY});
rl.on('SIGINT',()=>process.exit(1));
process.stdout.write('Paste the token (input is hidden), then press Enter: ');
const token=(await new Promise(resolve=>rl.question('',resolve))).trim();rl.close();
console.log('\nChecking the token and Monad historical access...');
try{
  if(!token||/[\s"'#]/.test(token))throw Error('Invalid token format. Copy the token without quotes or spaces.');
  // A tiny real query verifies authorization, JSON schema and event decoding.
  const page=await new HyperSync(token).page(DEPLOYMENT_BLOCK,DEPLOYMENT_BLOCK+99);
  const comparison=await verifyHyperSync(token);
  const file=new URL('../.env',import.meta.url);let old='';try{old=readFileSync(file,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
  old=old.replace(/^\s*(?:export\s+)?ENVIO_API_TOKEN\s*=.*\r?\n?/gm,'');
  writeFileSync(file,old.trimEnd()+'\nENVIO_API_TOKEN='+token+'\n',{mode:0o600});
  console.log('Verified '+(page.next-DEPLOYMENT_BLOCK)+' historical blocks. Token saved locally.');
  console.log('Recent sample: '+comparison.events+' events exactly match public RPC, including wallet attribution.');
  console.log('Close the old dashboard launcher, then run Start Perpl Pulse.cmd again.');
  console.log('The Local data engine panel will show HyperSync; existing history is preserved.');
}catch(e){console.error('Setup failed: '+(String(e.message).includes(token)&&token?'request failed':e.message));process.exitCode=1;}
