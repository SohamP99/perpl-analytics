import {createService,authorized} from './server.mjs';
import {targetFor} from './routes.mjs';
let service;
function getService(){return service??=(createService().catch(e=>{service=undefined;let message=String(e.message||'');for(const [key,value] of Object.entries(process.env)){if(/TOKEN|PASSWORD|SECRET|DATABASE_URL/i.test(key)&&value?.length>5){message=message.split(value).join('[redacted]');if(key==='DATABASE_URL'){try{message=message.split(decodeURIComponent(new URL(value).password)).join('[redacted]');}catch{}}}}console.error('Cloud initialization failed',JSON.stringify({code:e.code||e.name,message:message.slice(0,240),file:e.code==='ENOENT'?String(e.path||'').split(/[\\/]/).pop():undefined}));throw e;}));}
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
   const forwarded={method:req.method,url:job?'/jobs/refresh':url.pathname+url.search,headers:{authorization:job?req.headers.authorization:'Bearer '+env.PERPL_BACKEND_TOKEN}};
   await handler(forwarded,res);
  }catch(e){console.error('Cloud request failed',JSON.stringify({code:e.code||e.name}));return send(502,'Cloud data service is temporarily unavailable');}
 };
}
export default createVercelHandler();
