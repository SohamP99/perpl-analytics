// Server-only Vercel adapter. Credentials never enter the frontend bundle.
import {targetFor} from '../cloud/routes.mjs';
import cloudHandler from '../cloud/vercel.mjs';
export {targetFor} from '../cloud/routes.mjs';
export default async function handler(req,res){
 if(process.env.DATABASE_URL)return cloudHandler(req,res);
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
