import {DatabaseSync} from 'node:sqlite';
import {writeFileSync,mkdirSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {boundary} from '../indexer/summary-spec.mjs';
import {seedTables,seedSettings,decodeSeed} from '../cloud/seed.mjs';
const file=process.argv[2]||new URL('../.perpl-data/summaries.sqlite',import.meta.url);
const db=new DatabaseSync(file,{readOnly:true});db.exec('BEGIN');
try{
 const settings={};for(const r of db.prepare('SELECT * FROM settings').all())if(seedSettings.includes(r.key)||/^market-metadata:\d+$/.test(r.key))settings[r.key]=JSON.parse(r.value);
 const tables={};for(const table of Object.keys(seedTables))tables[table]=db.prepare('SELECT * FROM '+table).all().map(r=>({...r,...('args'in r?{args:JSON.parse(r.args)}:{}),...('amounts'in r?{amounts:JSON.parse(r.amounts)}:{})}));
 const bytes=gzipSync(JSON.stringify({version:1,boundary,settings,tables}),{level:9}),checksum=createHash('sha256').update(bytes).digest('hex');decodeSeed(bytes,checksum);
 const out=new URL('../cloud/',import.meta.url);mkdirSync(out,{recursive:true});writeFileSync(new URL('seed.json.gz',out),bytes);
 const manifest={sha256:checksum,checkpoint:settings.next,throughTime:settings.throughTime,bytes:bytes.length,rows:Object.fromEntries(Object.entries(tables).map(([k,v])=>[k,v.length]))};
 writeFileSync(new URL('seed-manifest.json',out),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest));
}finally{db.exec('ROLLBACK');db.close();}
