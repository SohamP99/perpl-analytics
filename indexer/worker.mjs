import {parentPort} from 'node:worker_threads';
import {Indexer} from './service.mjs';
const indexer=new Indexer();indexer.start();
parentPort.on('message',message=>{if(message==='stop'){indexer.stop();process.exit(0);}});
