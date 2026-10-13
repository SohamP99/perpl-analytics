import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spectrumClient,SpectrumBackfill} from '../indexer/spectrum.mjs';
import {Store} from '../indexer/store.mjs';
process.loadEnvFile(new URL('../.env',import.meta.url));
const db=new DatabaseSync(new URL('../.perpl-data/index.sqlite',import.meta.url),{readOnly:true});
const start=JSON.parse(db.prepare("SELECT value FROM meta WHERE key='futureNext'").get().value);db.close();
const client=spectrumClient(),scanner=new SpectrumBackfill(client,{workers:2,window:100});
const dir=mkdtempSync(path.join(tmpdir(),'perpl-live-spectrum-'));let store;
try{
 const t=Date.now(),results=await scanner.fetch(start,start+199);
 store=new Store(path.join(dir,'index.sqlite'));store.set('futureNext',start);
 for(const r of results){if(r.status==='rejected')throw r.reason;store.stageFuture(r.value);}
 console.log(JSON.stringify({verified:true,blocks:200,events:store.futureStatus().events,seconds:(Date.now()-t)/1000,next:store.get('futureNext'),note:'Authenticated retrieval and SQLite staging verified in an isolated test database; user checkpoints untouched.'}));
}catch(e){console.log(JSON.stringify({verified:false,error:e.message}));process.exitCode=1;}
finally{store?.close();if(!path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep))throw Error('Invalid test directory');rmSync(dir,{recursive:true,force:true});}
