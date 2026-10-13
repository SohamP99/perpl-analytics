import {DatabaseSync} from 'node:sqlite';
import {statSync,writeFileSync,createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {decodeLogs} from '../indexer/chain.mjs';
import {duneBlocks} from '../indexer/dune-csv.mjs';
const file=process.argv[2];if(!file)throw Error('Provide a Dune CSV path');
const from=87354179,to=87364179;
const db=new DatabaseSync(new URL('../.perpl-data/index.sqlite',import.meta.url),{readOnly:true});
const report={queryId:8934112,fromBlockInclusive:from,toBlockExclusive:to,fileBytes:statSync(file).size,rawRows:0,decodedEvents:0,contextRows:0,blocksWithEvents:0,firstBlock:null,lastBlock:null,byEvent:{},localCompared:0,localMismatches:0,examples:[]};
const canonical=x=>JSON.stringify(Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))));
const sha=createHash('sha256');for await(const chunk of createReadStream(file))sha.update(chunk);report.sha256=sha.digest('hex');
db.exec('BEGIN');
try{
 const next=JSON.parse(db.prepare("SELECT value FROM meta WHERE key='next'").get().value);report.mainNextAtValidation=next;
 const get=db.prepare('SELECT * FROM events WHERE block=? ORDER BY log_index');
 for await(const logs of duneBlocks(file,{from,to})){
  const block=Number(BigInt(logs[0].blockNumber));report.blocksWithEvents++;report.rawRows+=logs.length;report.firstBlock??=block;report.lastBlock=block;
  const rows=decodeLogs(logs);report.decodedEvents+=rows.length;report.contextRows+=logs.length-rows.length;
  for(const row of rows)report.byEvent[row.name]=(report.byEvent[row.name]||0)+1;
  if(block>=next)continue;
  const existing=get.all(block);report.localCompared+=rows.length;
  try{
   assert.equal(existing.length,rows.length);
   for(let i=0;i<rows.length;i++){
    const a=rows[i],b=existing[i];
    assert.deepEqual([a.id,a.block,a.hash,a.tx,a.logIndex,a.time,a.name,a.account,a.market,canonical(a.args)],[b.id,b.block,b.hash,b.tx,b.log_index,b.time,b.name,b.account,b.market,canonical(JSON.parse(b.args))]);
   }
  }catch{report.localMismatches++;if(report.examples.length<5)report.examples.push({block,csvEvents:rows.length,localEvents:existing.length});}
 }
 report.localRangeEvents=db.prepare('SELECT COUNT(*) n FROM events WHERE block>=? AND block<?').get(from,Math.min(to,next)).n;
 report.fullyMatchedExistingHistory=next>=to&&report.localMismatches===0&&report.localCompared===report.decodedEvents&&report.localRangeEvents===report.decodedEvents;
 db.exec('COMMIT');
}finally{db.close();}
writeFileSync(new URL('../../../outputs/dune/pilot-validation.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
