import {SummaryStore} from '../indexer/summary-store.mjs';
import {importActivityChunks} from '../indexer/summary-import.mjs';
import {fileURLToPath} from 'node:url';
const files=process.argv.slice(2);if(!files.length)throw Error('Usage: node scripts/import-activity-chunks.mjs MONTH1.csv MONTH2.csv ...');
const store=new SummaryStore(fileURLToPath(new URL('../.perpl-data/summaries.sqlite',import.meta.url)));
try{console.log(JSON.stringify(await importActivityChunks(store,files)));}finally{store.close();}
