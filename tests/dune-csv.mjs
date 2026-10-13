import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseCsvLine,normalizeDune,duneBlocks} from '../indexer/dune-csv.mjs';
import {EXCHANGE,abi} from '../indexer/chain.mjs';
assert.deepEqual(parseCsvLine('a,"b,c","d""e",'),['a','b,c','d"e','']);
assert.throws(()=>parseCsvLine('a,"unfinished'));
const row={block_number:'100',block_timestamp:'1783893342',block_hash:'0x'+'11'.repeat(32),transaction_hash:'0x'+'22'.repeat(32),log_index:'4',address:EXCHANGE,topic0:abi.getEvent('AccountCreated').topicHash,topic1:'',topic2:'',topic3:'',data:'0x',event_name:'AccountCreated'};
assert.equal(normalizeDune(row).blockNumber,'0x64');
assert.throws(()=>normalizeDune({...row,event_name:'CollateralDeposit'}));
assert.throws(()=>normalizeDune({...row,topic2:'0x'+'33'.repeat(32)}));
assert.throws(()=>normalizeDune({...row,data:'0x123'}));
const dir=mkdtempSync(join(tmpdir(),'perpl-dune-test-')),file=join(dir,'sample.csv');
const collect=async()=>{const result=[];for await(const b of duneBlocks(file,{from:100,to:102}))result.push(b);return result;};
const save=rows=>writeFileSync(file,Object.keys(row).join(',')+'\n'+rows.map(r=>Object.values(r).join(',')).join('\n'));
try{
 save([row,{...row,log_index:'5'},{...row,block_number:'101',log_index:'0'}]);
 assert.deepEqual((await collect()).map(b=>b.length),[2,1]);
 save([row,row]);await assert.rejects(collect,/duplicate/);
 save([row,{...row,log_index:'5',block_hash:'0x'+'44'.repeat(32)}]);await assert.rejects(collect,/Inconsistent/);
 save([{...row,block_number:'102'}]);await assert.rejects(collect,/outside/);
 writeFileSync(file,Object.keys(row).join(',')+'\n100,broken');await assert.rejects(collect,/Incomplete/);
}finally{rmSync(dir,{recursive:true});}
console.log('Dune CSV validation tests passed.');
