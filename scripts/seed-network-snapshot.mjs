// One-time capture of publicly displayed query results supplied by the user.
// This script never executes Dune queries or requests a Dune API key.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {applyNetworkCsv} from '../indexer/network-snapshot.mjs';
const capturedAt=new Date().toISOString();
const counts=[118437,115501,105660,114981,132159,140306,151438,127927,130612,122874,109335,112750,107776,121908,138634,170987,213447,162165,138944,134340,126811,127359,89047,105559];
let snapshot={schema:1};
snapshot=applyNetworkCsv(snapshot,'avg_tps_24h\n36.1',{capturedAt});
snapshot=applyNetworkCsv(snapshot,'hour,transactions\n'+counts.map((n,i)=>new Date(Date.UTC(2026,9,12,8+i)).toISOString()+','+n).join('\n'),{capturedAt});
snapshot=applyNetworkCsv(snapshot,readFileSync(process.argv[2],'utf8'),{capturedAt});
mkdirSync(new URL('../data/',import.meta.url),{recursive:true});
writeFileSync(new URL('../data/network-snapshot.json',import.meta.url),JSON.stringify(snapshot,null,2)+'\n');
console.log(JSON.stringify({tps:snapshot.tps.value,hours:snapshot.hourly.data.length,transactions:counts.reduce((a,b)=>a+b,0),days:snapshot.emissions.data.length,first:snapshot.emissions.data[0],last:snapshot.emissions.data.at(-1)}));
