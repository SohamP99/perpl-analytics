// Server-only Vercel adapter. Credentials never enter the frontend bundle.
export function targetFor(requestUrl,backend){
 const incoming=new URL(requestUrl,'http://localhost'),raw=incoming.searchParams.get('path')||incoming.pathname.replace(/^\/api\//,'');
 if(!/^(?:local\/(?:status|protocol|liquidations|funding-history|leaderboard|market-snapshot|wallet\/0x[a-fA-F0-9]{40})|perpl\/v1\/market-data\/\d+\/candles\/(?:60|300|900|1800|3600|7200|14400|28800|43200|86400)\/\d+-\d+)$/.test(raw))throw Error('Unsupported API path');
 const origin=new URL(backend);if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw Error('Invalid backend origin');
 const target=new URL('/api/'+raw,origin);
 const allowed=new Set(['market','refresh','kind','page','through']);
 for(const [key,value] of incoming.searchParams){if(key==='path')continue;if(!allowed.has(key)||value.length>100)throw Error('Invalid query');target.searchParams.set(key,value);}
 return target;
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Read-only API'});}
 if(!process.env.PERPL_BACKEND_URL||!process.env.PERPL_BACKEND_TOKEN)return res.status(503).json({error:'Cloud backend is not configured'});
 let target;try{target=targetFor(req.url,process.env.PERPL_BACKEND_URL)}catch{return res.status(400).json({error:'Invalid API request'});}
 try{
  const r=await fetch(target,{headers:{Authorization:'Bearer '+process.env.PERPL_BACKEND_TOKEN,Accept:'application/json'},signal:AbortSignal.timeout(50000),redirect:'error'});
  if(!r.headers.get('content-type')?.includes('application/json'))throw Error('Unexpected backend response');
  res.setHeader('Content-Type','application/json');res.status(r.status).send(await r.text());
 }catch{return res.status(502).json({error:'Cloud data service is temporarily unavailable'});}
}
