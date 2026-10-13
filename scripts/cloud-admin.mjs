import pg from 'pg';
import {databaseConnection} from '../cloud/server.mjs';
process.loadEnvFile(new URL('../.env.cloud',import.meta.url));
const pool=new pg.Pool(databaseConnection());
try{
 const action=process.argv[2]||'inspect';
 if(action==='schedule'){
  const origin=new URL(process.argv[3]);
  if(origin.protocol!=='https:'||!origin.hostname.endsWith('.vercel.app')||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw Error('Use the verified production Vercel origin');
  if(!process.env.PERPL_JOB_TOKEN||process.env.PERPL_JOB_TOKEN.length<32)throw Error('Missing job token');
  await pool.query('CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog');
  await pool.query('CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions');
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   for(const [name,value] of [['perpl_pulse_origin',origin.origin],['perpl_pulse_job_token',process.env.PERPL_JOB_TOKEN]]){
    const existing=(await client.query('SELECT id FROM vault.secrets WHERE name=$1',[name])).rows[0];
    if(existing)await client.query('SELECT vault.update_secret($1,$2)',[existing.id,value]);
    else await client.query('SELECT vault.create_secret($1,$2)',[value,name]);
   }
   const command=`DELETE FROM cron.job_run_details WHERE jobid IN (SELECT jobid FROM cron.job WHERE jobname='perpl-pulse-refresh') AND start_time<now()-interval '7 days';
    SELECT net.http_post(url:=(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='perpl_pulse_origin')||'/api/refresh',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='perpl_pulse_job_token')),body:='{}'::jsonb,timeout_milliseconds:=55000);`;
   await client.query('SELECT cron.schedule($1,$2,$3)',['perpl-pulse-refresh','*/5 * * * *',command]);
   await client.query('COMMIT');console.log('Five-minute cloud scheduler configured; credentials stored in Vault.');
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 }
 if(action==='status'){
  const jobs=await pool.query("SELECT jobid,jobname,schedule,active FROM cron.job WHERE jobname='perpl-pulse-refresh'");
  const runs=await pool.query("SELECT status,start_time,end_time FROM cron.job_run_details WHERE jobid IN (SELECT jobid FROM cron.job WHERE jobname='perpl-pulse-refresh') ORDER BY start_time DESC LIMIT 3");
  const responses=await pool.query('SELECT id,status_code,timed_out,error_msg,created,left(content,700) AS content FROM net._http_response ORDER BY id DESC LIMIT 3');
  const checkpoint=await pool.query("SELECT key,value FROM perpl.settings WHERE key IN ('next','throughTime','lastRun','lastAttempt','error','nextRun')");
  console.log(JSON.stringify({jobs:jobs.rows,runs:runs.rows,responses:responses.rows,checkpoint:checkpoint.rows}));
 }
 const extensions=await pool.query("SELECT name,installed_version FROM pg_available_extensions WHERE name IN ('pg_cron','pg_net','supabase_vault')");
 if(action==='inspect')console.log(JSON.stringify({extensions:extensions.rows}));
}catch(e){console.log(JSON.stringify({error:e.code||e.name}));process.exitCode=1;}finally{await pool.end();}
