import {createService,authorized} from './server.mjs';
import {targetFor} from './routes.mjs';
let service;
function getService(){return service??=(createService().catch(e=>{service=undefined;console.error('Cloud initialization failed',JSON.stringify({code:e.code||e.name,file:e.code==='ENOENT'?String(e.path||'').split(/[\\/]/).pop():undefined}));throw e;}));}
export function createVercelHandler({get=getService,env=process.env}={}){
 return async function(req,res){
  const send=(code,error)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error}));};
  let url;try{url=new URL(req.url,'https://dashboard.invalid');}catch{return send(400,'Invalid request');}
  const job=url.pathname==='/api/refresh';
  if(job){
   if(!authorized(req.headers.authorization,env.PERPL_JOB_TOKEN))return send(401,'Unauthorized');
   if(req.method!=='POST')return send(405,'Use POST');
  }else{
   if(req.method!=='GET')return send(405,'Read-only API');
   try{url=targetFor(req.url,'https://dashboard.invalid');}catch{return send(400,'Invalid API request');}
  }
  if(!env.DATABASE_URL||!env.PERPL_BACKEND_TOKEN||!env.PERPL_JOB_TOKEN)return send(503,'Cloud backend is not configured');
  try{
   const {handler}=await get();
   // Inject only the read credential, after strict route validation.
   // Scheduled writes must supply their own independent job credential.
   const originalUrl=req.url,originalAuth=req.headers.authorization;
   req.url=job?'/jobs/refresh':url.pathname+url.search;
   if(!job)req.headers.authorization='Bearer '+env.PERPL_BACKEND_TOKEN;
   try{await handler(req,res);}finally{req.url=originalUrl;if(originalAuth===undefined)delete req.headers.authorization;else req.headers.authorization=originalAuth;}
  }catch{return send(502,'Cloud data service is temporarily unavailable');}
 };
}
export default createVercelHandler();

