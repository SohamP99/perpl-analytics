export function targetFor(requestUrl,backend){
 const incoming=new URL(requestUrl,'http://localhost'),raw=incoming.searchParams.get('path')||incoming.pathname.replace(/^\/api\//,'');
 if(!/^(?:local\/(?:status|protocol|liquidations|funding-history|leaderboard|market-snapshot|wallet\/0x[a-fA-F0-9]{40})|perpl\/v1\/market-data\/\d+\/candles\/(?:60|300|900|1800|3600|7200|14400|28800|43200|86400)\/\d+-\d+)$/.test(raw))throw Error('Unsupported API path');
 const origin=new URL(backend);if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw Error('Invalid backend origin');
 const target=new URL('/api/'+raw,origin),allowed=new Set(['market','refresh','kind','page','through']);
 for(const [key,value] of incoming.searchParams){if(key==='path')continue;if(!allowed.has(key)||value.length>100)throw Error('Invalid query');target.searchParams.set(key,value);}
 return target;
}
