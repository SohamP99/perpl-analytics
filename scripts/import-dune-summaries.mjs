import {SummaryStore} from '../indexer/summary-store.mjs';
import {importSummaries} from '../indexer/summary-import.mjs';
import {fileURLToPath} from 'node:url';
const files=process.argv.slice(2);if(![2,3].includes(files.length))throw Error('Usage: node scripts/import-dune-summaries.mjs DAILY.csv [ACTIVITY.csv] COVERAGE.csv');
const store=new SummaryStore(fileURLToPath(new URL('../.perpl-data/summaries.sqlite',import.meta.url)));
try{console.log(JSON.stringify(await importSummaries(store,files)));}finally{store.close();}
