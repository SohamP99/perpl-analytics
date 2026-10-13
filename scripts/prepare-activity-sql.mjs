import {mkdirSync,writeFileSync} from 'node:fs';
import {activityQuery} from './activity-query.mjs';
const out=new URL('../../../outputs/dune-summaries/activity-monthly/',import.meta.url);mkdirSync(out,{recursive:true});
const dates=['2026-02-01','2026-03-01','2026-04-01','2026-05-01','2026-06-01','2026-07-01','2026-08-01','2026-09-01','2026-10-01','2026-10-13'];
let combined='Perpl — Historical daily trading-account activity\n\nRun each titled query separately. All boundaries are already filled in.\nExport all result rows to CSV, not the limited preview. Send the nine CSV files.\nOnly this third query needs replacing; the other two exports are already imported.\nThese queries have not yet been executed on Dune. Monthly batching reduces work per run; execution time depends on Dune resources.\n\n';
for(let i=0;i<dates.length-1;i++){const sql=activityQuery(dates[i],dates[i+1]);writeFileSync(new URL(`${dates[i].slice(0,7)}-activity.sql`,out),sql);combined+=`\n${'='.repeat(72)}\nTITLE: Perpl — Daily trading-account activity — ${dates[i].slice(0,7)}\n${'='.repeat(72)}\n\n${sql}\n`;}
writeFileSync(new URL('ALL-QUERIES.txt',out),combined);
writeFileSync(new URL('../02-account-activity.sql',out),activityQuery(dates[0],dates.at(-1)));
console.log('Prepared nine complete monthly activity queries and an optimized full-range alternative.');
