import {DatabaseSync} from 'node:sqlite';
import {existsSync} from 'node:fs';
import {DEPLOYMENT_BLOCK,HISTORY_START} from './chain.mjs';

export function resumePoint(next=DEPLOYMENT_BLOCK,batch=null){
  if(!Number.isSafeInteger(next)||next<DEPLOYMENT_BLOCK)throw Error('Invalid saved history checkpoint.');
  if(next===DEPLOYMENT_BLOCK&&!batch)return {next,verifyBlock:DEPLOYMENT_BLOCK,hash:null,time:null};
  if(!batch||batch.end!==next-1||!Number.isSafeInteger(batch.start)||batch.start<DEPLOYMENT_BLOCK||batch.start>batch.end||!/^0x[0-9a-f]{64}$/i.test(batch.hash)||!Number.isFinite(batch.time)||batch.time<HISTORY_START)throw Error('Saved history boundary is inconsistent; refusing to skip a gap.');
  return {next,verifyBlock:batch.end,hash:batch.hash,time:batch.time};
}

export function readResumePoint(file){
  if(!existsSync(file))return resumePoint();
  const db=new DatabaseSync(file,{readOnly:true});
  try{
    db.exec('PRAGMA busy_timeout=5000; BEGIN');
    const row=db.prepare("SELECT value FROM meta WHERE key='next'").get();
    const batch=db.prepare('SELECT * FROM batches ORDER BY end DESC LIMIT 1').get();
    const point=resumePoint(row?JSON.parse(row.value):DEPLOYMENT_BLOCK,batch);
    db.exec('COMMIT');return point;
  }finally{db.close();}
}
