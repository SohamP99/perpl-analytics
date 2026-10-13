import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';
import {parseCsvLine} from './dune-csv.mjs';
import {boundary,summaryNames} from './summary-spec.mjs';
export async function* csv(file){let header;for await(const line of createInterface({input:createReadStream(file,{encoding:'utf8'}),crlfDelay:Infinity})){if(!header){header=parseCsvLine(line.replace(/^\uFEFF/,''));if(new Set(header).size!==header.length)throw Error('Duplicate CSV header');continue;}if(!line)continue;const cells=parseCsvLine(line);if(cells.length!==header.length)throw Error('Incomplete CSV row');yield Object.fromEntries(header.map((k,i)=>[k,cells[i]]));}if(!header)throw Error('Empty CSV');}
const num=(v)=>{if(!/^\d+$/.test(v)||!Number.isSafeInteger(Number(v)))throw Error('Invalid integer in summary');return Number(v);};
const raw=(v)=>{if(!/^\d+$/.test(v))throw Error('Invalid raw collateral amount');return BigInt(v).toString();};
const day=(d)=>{if(!/^2026-\d\d-\d\d$/.test(d)||d<'2026-02-01'||d>='2026-10-13'||new Date(d+'T00:00:00Z').toISOString().slice(0,10)!==d)throw Error('Invalid summary day');return d;};
async function checksum(file){const h=createHash('sha256');for await(const c of createReadStream(file))h.update(c);return h.digest('hex');}
export async function importSummaries(store,files){
 if(![2,3].includes(files.length))throw Error('Expected daily, optional activity, and coverage CSV files');
 const dailyFile=files[0],accountFile=files.length===3?files[1]:null,coverageFile=files.at(-1),coverage=[];for await(const r of csv(coverageFile))coverage.push(r);
 if(coverage.length!==1)throw Error('Coverage query must return exactly one row');const c=coverage[0];
 if(num(c.from_block_inclusive)!==boundary.fromBlock||num(c.to_block_exclusive)!==boundary.toBlockExclusive||num(c.last_historical_block)!==boundary.toBlockExclusive-1||c.last_historical_hash.toLowerCase()!==boundary.parentHash||Date.parse(c.cutoff_utc.replace(' ','T')+'Z')!==Date.parse(boundary.cutoff))throw Error('Dune coverage does not match the verified cutoff');
 const checksums=await Promise.all(files.map(checksum));
 // Stage into TEMP tables while downloads are validated. Live tables change only
 // in the final short transaction; a bad or truncated file cannot replace history.
 store.db.exec('DROP TABLE IF EXISTS temp.import_daily; DROP TABLE IF EXISTS temp.import_accounts; CREATE TEMP TABLE import_daily AS SELECT * FROM daily WHERE 0; CREATE UNIQUE INDEX temp.daily_unique ON import_daily(day,event); CREATE TEMP TABLE import_accounts AS SELECT * FROM accounts WHERE 0; CREATE UNIQUE INDEX temp.accounts_unique ON import_accounts(day,account);');
 let dailyCount=0,eventCount=0,fillCount=0,dailyExpected=null,eventExpected=null,accountCount=0,accountExpected=null,fillExpected=null,actualFills=0;
 for await(const r of csv(dailyFile)){
  if(!summaryNames.includes(r.event_name))throw Error('Unknown summary event');const count=num(r.event_count);if(count<1)throw Error('Invalid event count');
  const expected=num(r.export_rows),source=num(r.source_events);if(dailyExpected!==null&&(dailyExpected!==expected||eventExpected!==source))throw Error('Inconsistent daily completeness metadata');dailyExpected=expected;eventExpected=source;
  const values=['amount','fee','builder_fee','insurance_fee','protocol_fee'].map(k=>raw(r[k+'_cns']));
  store.db.prepare('INSERT INTO import_daily VALUES(?,?,?,?,?)').run('dune',day(r.day),r.event_name,count,JSON.stringify(values));dailyCount++;eventCount+=count;if(r.event_name.includes('OrderFilled'))fillCount+=count;
 }
 if(!dailyCount||dailyCount!==dailyExpected||eventCount!==eventExpected)throw Error('Truncated daily summary');
 if(accountFile)for await(const r of csv(accountFile)){
  const expected=num(r.export_rows),source=num(r.source_fills);if(accountExpected!==null&&(accountExpected!==expected||fillExpected!==source))throw Error('Inconsistent activity completeness metadata');accountExpected=expected;fillExpected=source;
  if(!/^\d+$/.test(r.account_id)||BigInt(r.account_id)===0n)throw Error('Missing or invalid fill attribution');const fills=num(r.fill_events);if(fills<1)throw Error('Invalid fill count');
  store.db.prepare('INSERT INTO import_accounts VALUES(?,?,?,?)').run('dune',day(r.day),r.account_id,fills);accountCount++;actualFills+=fills;
 }
 if(accountFile&&(!accountCount||accountCount!==accountExpected||actualFills!==fillExpected||actualFills!==fillCount))throw Error('Incomplete activity summary or mismatched query results');
 if(accountFile)assertDailyFills(store.db,'import_daily');
 const result={at:Date.now(),checksums,dailyCount,accountCount,eventCount,fillCount,cutoff:boundary.cutoff,activityImported:!!accountFile};
 store.db.exec('BEGIN IMMEDIATE');try{
  store.db.exec("DELETE FROM daily WHERE source='dune'; INSERT INTO daily SELECT * FROM import_daily;");
  if(accountFile){store.db.exec("DELETE FROM accounts WHERE source='dune'; INSERT INTO accounts SELECT * FROM import_accounts;");store.set('activityImported',{at:Date.now(),fillCount});}
  else if(store.get('activityImported')?.fillCount!==fillCount){store.db.exec("DELETE FROM accounts WHERE source='dune'");store.set('activityImported',null);}
  result.activityImported=!!store.get('activityImported');store.set('imported',result);store.db.exec('COMMIT');
 }catch(e){store.db.exec('ROLLBACK');throw e;}
 return result;
}

function assertDailyFills(db,dailyTable){
 const expected=new Map(db.prepare(`SELECT day,SUM(count) n FROM ${dailyTable} WHERE source='dune' AND event LIKE '%OrderFilled%' GROUP BY day`).all().map(r=>[r.day,r.n]));
 for(const row of db.prepare('SELECT day,SUM(fills) n FROM import_accounts GROUP BY day').all()){
  if(expected.get(row.day)!==row.n)throw Error('Activity fills do not match protocol totals for '+row.day);
  expected.delete(row.day);
 }
 if(expected.size)throw Error('Activity is missing trading days');
}

export async function importActivityChunks(store,files){
 if(!files.length||!store.get('imported'))throw Error('Import daily protocol and coverage CSVs before activity');
 const checksums=await Promise.all(files.map(checksum)),ranges=[];
 store.db.exec('DROP TABLE IF EXISTS temp.import_accounts; CREATE TEMP TABLE import_accounts AS SELECT * FROM accounts WHERE 0; CREATE UNIQUE INDEX temp.accounts_unique ON import_accounts(day,account);');
 let accountCount=0,fillCount=0;
 const insert=store.db.prepare('INSERT INTO import_accounts VALUES(?,?,?,?)');
 for(const file of files){let count=0,fills=0,meta=null;
  for await(const r of csv(file)){
   const start=day(r.window_start),end=r.window_end_exclusive;
   if(end!=='2026-10-13')day(end);
   if(end<=start)throw Error('Invalid activity window');
   const next={start,end,rows:num(r.export_rows),fills:num(r.source_fills)};
   if(meta&&JSON.stringify(next)!==JSON.stringify(meta))throw Error('Inconsistent activity metadata');meta=next;
   const d=day(r.day);if(d<start||d>=end)throw Error('Activity outside exported window');
   if(!/^\d+$/.test(r.account_id)||BigInt(r.account_id)===0n)throw Error('Missing or invalid fill attribution');
   const n=num(r.fill_events);if(n<1)throw Error('Invalid fill count');
   insert.run('dune',d,r.account_id,n);count++;fills+=n;
  }
  if(!meta||count!==meta.rows||fills!==meta.fills)throw Error('Truncated activity chunk');
  ranges.push(meta);accountCount+=count;fillCount+=fills;
 }
 ranges.sort((a,b)=>a.start.localeCompare(b.start));let next='2026-02-01';
 for(const r of ranges){if(r.start!==next)throw Error('Activity windows overlap or leave a gap');next=r.end;}
 if(next!=='2026-10-13')throw Error('Activity history does not reach the cutoff');
 const result={at:Date.now(),checksums,accountCount,fillCount};
 store.db.exec('BEGIN IMMEDIATE');try{
  assertDailyFills(store.db,'daily');
  store.db.exec("DELETE FROM accounts WHERE source='dune'; INSERT INTO accounts SELECT * FROM import_accounts;");
  store.set('activityImported',result);store.db.exec('COMMIT');
 }catch(e){store.db.exec('ROLLBACK');throw e;}
 return result;
}
