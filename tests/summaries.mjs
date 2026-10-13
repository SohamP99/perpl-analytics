import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {SummaryStore} from '../indexer/summary-store.mjs';
import {SummaryEngine} from '../indexer/summary-engine.mjs';
import {importSummaries} from '../indexer/summary-import.mjs';
import {boundary,summaryNames,offsets,amountFields,REFRESH_MS} from '../indexer/summary-spec.mjs';
import {abi} from '../indexer/chain.mjs';
const dir=mkdtempSync(path.join(tmpdir(),'perpl-summary-test-')),file=path.join(dir,'test.sqlite');
let store=new SummaryStore(file);
const daily=path.join(dir,'daily.csv'),accounts=path.join(dir,'accounts.csv'),coverage=path.join(dir,'coverage.csv');
const dailyHeader='day,event_name,event_count,amount_cns,fee_cns,builder_fee_cns,insurance_fee_cns,protocol_fee_cns,export_rows,source_events\n';
const dailyBody='2026-07-01,CollateralDeposit,2,9000000,0,0,0,0,2,3\n2026-07-01,MakerOrderFilled,1,0,200000,300,0,0,2,3\n';
const accountBody='day,account_id,fill_events,export_rows,source_fills\n2026-07-01,7,1,1,1\n';
writeFileSync(daily,dailyHeader+dailyBody);writeFileSync(accounts,accountBody);writeFileSync(coverage,`from_block_inclusive,to_block_exclusive,last_historical_block,last_historical_hash,last_historical_time,cutoff_utc\n54773010,${boundary.toBlockExclusive},${boundary.toBlockExclusive-1},${boundary.parentHash},2026-10-12 23:59:59,2026-10-13 00:00:00\n`);
try{
 for(const name of summaryNames){const f=abi.getEvent(name),values=f.inputs.map((p,i)=>p.type==='bool'?false:p.type==='address'?'0x'+'11'.repeat(20):p.type==='bytes'?'0x':BigInt(i+1));const encoded=abi.encodeEventLog(f,values);offsets(name).forEach((off,i)=>{if(off)assert.equal(BigInt('0x'+encoded.data.slice(2+(off-1)*2,2+(off-1+32)*2)),BigInt(values[f.inputs.findIndex(p=>p.name===amountFields[i])]))});}
 await importSummaries(store,[daily,coverage]);assert.equal(store.view().deposits,9);assert.equal(store.view().activeAccounts,null);assert.equal(store.view().coverage.activityImported,false);
 await importSummaries(store,[daily,accounts,coverage]);assert.equal(store.view().deposits,9);assert.equal(store.view().activeAccounts,1);
 await importSummaries(store,[daily,coverage]);assert.equal(store.view().activeAccounts,1,'reimporting identical daily totals preserves verified activity');
 await importSummaries(store,[daily,accounts,coverage]);assert.equal(store.view().deposits,9,'reimport must replace, never double count');
 writeFileSync(accounts,accountBody.replace('7,1,1,1','7,2,1,2'));await assert.rejects(()=>importSummaries(store,[daily,accounts,coverage]),/mismatched/);assert.equal(store.view().deposits,9);
 writeFileSync(accounts,accountBody);writeFileSync(daily,dailyHeader+dailyBody.split('\n')[0]+'\n');await assert.rejects(()=>importSummaries(store,[daily,accounts,coverage]),/Truncated/);
 const batch={start:boundary.toBlockExclusive,end:boundary.toBlockExclusive,firstParentHash:boundary.parentHash,hash:boundary.firstHash,time:Date.parse(boundary.cutoff),rows:[{block:boundary.toBlockExclusive,time:Date.parse(boundary.cutoff),name:'CollateralDeposit',account:'7',args:{amountCNS:'1000000'}},{block:boundary.toBlockExclusive,time:Date.parse(boundary.cutoff),name:'TakerOrderFilled',tx:'0x'+'12'.repeat(32),account:'7',args:{feeCNS:'100000'}}]};
 store.commit(batch);assert.equal(store.view().deposits,10);assert.equal(store.view().activeAccounts,1,'distinct accounts must deduplicate across Dune and new history');assert.equal(store.view().fees,0.3);
 assert.throws(()=>store.commit(batch),/continuity/);assert.equal(store.view().deposits,10);
 store.close();store=new SummaryStore(file);assert.equal(store.get('next'),boundary.toBlockExclusive+1);
 const engine=new SummaryEngine(store,{rpc:{block:async n=>n===undefined?{number:'0x'+(boundary.toBlockExclusive+65).toString(16)}:{hash:boundary.firstHash}}});
 engine.publicRead=async()=>({stale:false});engine.reader={range:async({start,end})=>({start,end,hash:'0x'+'33'.repeat(32),firstParentHash:boundary.firstHash,time:Date.parse(boundary.cutoff)+1000,rows:[]})};
 const now=Date.now();await engine.cycle();engine.stop();assert.ok(store.get('nextRun')>=now+REFRESH_MS);assert.equal(store.get('next'),boundary.toBlockExclusive+2);assert.equal(store.get('error'),'');
 console.log('PASS: ABI offsets, validated imports, atomic rejection, idempotent reimport, exact fees, distinct account merge, replay protection, checkpoint persistence and five-minute scheduling.');
}finally{store.close();assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));rmSync(dir,{recursive:true});}
