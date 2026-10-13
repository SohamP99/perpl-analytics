// Read-only provider probe against a disposable PostgreSQL test database.
// Never writes to the installed SQLite database or the cloud database.
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {PostgresStore} from '../cloud/postgres-store.mjs';
import {decodeSeed,importSeed} from '../cloud/seed.mjs';
import {runJob} from '../cloud/job.mjs';
try{process.loadEnvFile(new URL('../.env',import.meta.url));}catch(e){if(e.code!=='ENOENT')throw e;}
const db=new PGlite(),pool={query:async(sql,args)=>!args&&sql.split(';').filter(s=>s.trim()).length>1?(await db.exec(sql)).at(-1):db.query(sql,args),connect:async()=>({...pool,release(){}}),end:()=>db.close()};
const store=new PostgresStore(pool);await store.init();
try{const manifest=JSON.parse(readFileSync(new URL('../cloud/seed-manifest.json',import.meta.url)));await importSeed(store,decodeSeed(readFileSync(new URL('../cloud/seed.json.gz',import.meta.url)),manifest.sha256),manifest.sha256);const start=await store.get('next'),at=Date.now();const result=await runJob(store);console.log(JSON.stringify({...result,elapsedMs:Date.now()-at,blocksAdvanced:(await store.get('next'))-start,throughTime:await store.get('throughTime')}));}finally{await store.close();}
