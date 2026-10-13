import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {SummaryStore} from '../indexer/summary-store.mjs';
import {importActivityChunks} from '../indexer/summary-import.mjs';
import {activityQuery} from '../scripts/activity-query.mjs';
const dir=mkdtempSync(path.join(tmpdir(),'perpl-chunks-')),store=new SummaryStore(path.join(dir,'test.sqlite'));
const a=path.join(dir,'a.csv'),b=path.join(dir,'b.csv'),header='day,account_id,fill_events,export_rows,source_fills,window_start,window_end_exclusive\n';
const first='2026-02-12,7,3,1,3,2026-02-01,2026-07-01\n',second='2026-08-01,7,2,1,2,2026-07-01,2026-10-13\n';
try{
 store.set('imported',{fillCount:5});const insert=store.db.prepare("INSERT INTO daily VALUES('dune',?,?,?,?)");insert.run('2026-02-12','MakerOrderFilled',3,'["0","0","0","0","0"]');insert.run('2026-08-01','TakerOrderFilledV2',2,'["0","0","0","0","0"]');
 writeFileSync(a,header+first);writeFileSync(b,header+second);
 await assert.rejects(()=>importActivityChunks(store,[a]),/cutoff/);assert.equal(store.view().activeAccounts,null);
 await importActivityChunks(store,[b,a]);assert.equal(store.view().activeAccounts,1);assert.equal(store.get('activityImported').fillCount,5);
 await importActivityChunks(store,[a,b]);assert.equal(store.view().activeAccounts,1);
 await assert.rejects(()=>importActivityChunks(store,[a,a,b]),/UNIQUE/);assert.equal(store.view().activeAccounts,1);
 writeFileSync(b,header+second.replace('2,1,2,','2,2,2,'));await assert.rejects(()=>importActivityChunks(store,[a,b]),/Truncated/);
 writeFileSync(b,header+second.replace('2026-08-01,','2026-08-02,'));await assert.rejects(()=>importActivityChunks(store,[a,b]),/totals/);assert.equal(store.view().activeAccounts,1);
 const sql=activityQuery('2026-02-01','2026-03-01');assert.ok(sql.includes('LAST_VALUE(account_id) IGNORE NULLS'));assert.ok(sql.includes('JOIN taker_transactions'));assert.ok(!sql.includes('FROM daily ORDER BY'));assert.ok(!sql.includes('{{'));
 console.log('PASS: monthly activity import, unordered chunks, exact distinct accounts, idempotency, missing/duplicate/truncated/misattributed days rejected without changing saved data.');
}finally{store.close();assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));rmSync(dir,{recursive:true});}
