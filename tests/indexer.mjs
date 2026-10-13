import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {abi,EXCHANGE,DEPLOYMENT_BLOCK,HISTORY_START,hex,decodeLogs,positionView,positionIds} from '../indexer/chain.mjs';
import {Store} from '../indexer/store.mjs';
import {historyWindow} from '../lib/history.ts';
const dir=mkdtempSync(path.join(tmpdir(),'perpl-indexer-test-')),file=path.join(dir,'test.sqlite');
let store=new Store(file);
const tx='0x'+'a'.repeat(64),hash='0x'+'b'.repeat(64),time=Date.UTC(2026,1,12);
function event(name,args,index=0,transaction=tx,block=DEPLOYMENT_BLOCK){const f=abi.getEvent(name),v=f.inputs.map(p=>args[p.name]??(p.type==='bool'?false:p.type==='bytes'?'0x':0n)),data=abi.encodeEventLog(f,v);return {...data,address:EXCHANGE,blockNumber:hex(block),blockHash:hash,transactionHash:transaction,logIndex:hex(index),blockTimestamp:hex(time/1000)};}
try{
 const request=event('OrderRequestV2',{accountId:7n,perpId:1n,orderType:0n},0);
 const taker=event('TakerOrderFilledV2',{lotLNS:1000n,feeCNS:200n,builderFeeCNS:50n,entryPricePNS:820000n},1);
 const deposit=event('CollateralDeposit',{accountId:7n,amountCNS:9007199254740993n,balanceCNS:9007199254740993n},2);
 const close=event('PositionClosed',{accountId:7n,perpId:1n,deltaPnlCNS:-3000000n,fundingCNS:500000n},3);
 const rows=decodeLogs([close,deposit,taker,request]);assert.equal(rows[0].account,'7');assert.equal(rows[0].market,'1');assert.equal(rows[1].args.amountCNS,'9007199254740993');assert.equal(rows[2].args.deltaPnlCNS,'-3000000');
 assert.throws(()=>decodeLogs([request,{...taker,transactionHash:'0x'+'c'.repeat(64)}]),/missing OrderRequest/);
 assert.throws(()=>decodeLogs([{...deposit,removed:true}]),/Removed/);
 assert.equal(decodeLogs([{...deposit,blockTimestamp:hex((HISTORY_START-1)/1000|0)}]).length,0);
 assert.ok(store.acquire('one'));assert.equal(store.acquire('two'),false);store.release('one');assert.ok(store.acquire('two'));
 store.commit(DEPLOYMENT_BLOCK,DEPLOYMENT_BLOCK+9,hash,time,rows);const through=store.get('next')-1;
 assert.equal(store.walletStats('7').grossPnl,-2.5);assert.equal(store.walletStats('7').fees,0.00025);assert.equal(store.walletStats('7').trades,1);assert.equal(store.walletStats('7').profitFactor,0);
 assert.equal(store.protocol().activeAccounts,1);assert.equal(store.protocol().fees,0.0002);
 assert.throws(()=>store.commit(DEPLOYMENT_BLOCK,DEPLOYMENT_BLOCK+9,hash,time,rows),/Noncontiguous/);
 const next=decodeLogs([event('CollateralWithdrawal',{accountId:7n,amountCNS:100n},0,'0x'+'d'.repeat(64),DEPLOYMENT_BLOCK+10)]);
 store.commit(DEPLOYMENT_BLOCK+10,DEPLOYMENT_BLOCK+19,hash,time+1000,next);
 assert.equal(store.history('7','flows',0,through).rows.length,1);assert.equal(store.history('7','flows').rows.length,2);
 store.rollback(store.lastBatch());assert.equal(store.get('next'),DEPLOYMENT_BLOCK+10);assert.equal(store.history('7','flows').rows.length,1);
 store.close();store=new Store(file);assert.equal(store.get('next'),DEPLOYMENT_BLOCK+10);assert.equal(store.history('7','flows').rows[0].args.amountCNS,'9007199254740993');
 const p={positionType:0n,pricePNS:1001n,priceResiduePNSQ16:32768n,lotLNS:100n,depositCNS:10000000n,premiumPnlCNS:1000000n,pnlCNS:6000000n,entryBlock:10n},m={id:1,symbol:'BTC',config:{price_decimals:1,size_decimals:2}};
 const long=positionView(p,m,2000n,1050n,true);assert.equal(long.side,'Long');assert.equal(long.entry,100.05);assert.ok(long.liquidation<long.entry);assert.equal(long.unrealized,6);
 const short=positionView({...p,positionType:1n},m,2000n,950n,false);assert.equal(short.side,'Short');assert.equal(short.entry,100.15);assert.ok(short.liquidation>short.entry);assert.equal(short.unrealized,null);
 assert.deepEqual(positionIds([1n<<1n|1n<<253n,1n,1n,1n]),[1,253,509,765]);
 for(const period of ['ALL','30D','7D','24H'])assert.ok(historyWindow(period,Date.UTC(2026,1,3)).from>=HISTORY_START);
 assert.equal(historyWindow('ALL').from,HISTORY_START);
 console.log('PASS: decoded real ABI shapes, signed amounts, taker attribution isolation, February boundary, atomic replay/checkpoints, lease, rollback, restart, stable history window, position side/residue/liquidation math.');
}finally{store.close();assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));rmSync(dir,{recursive:true,force:true});}
