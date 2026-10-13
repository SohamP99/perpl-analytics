// Use a private schema, outside Supabase's public REST API.
// Configure Supabase's SESSION pooler (port 5432), not its transaction pooler.
export async function privatePool(pool){
 const setup=await pool.connect();
 try{
  await setup.query('BEGIN');await setup.query('SELECT pg_advisory_xact_lock(143,202601)');
  await setup.query('CREATE SCHEMA IF NOT EXISTS perpl');
  await setup.query('REVOKE ALL ON SCHEMA perpl FROM PUBLIC');await setup.query('COMMIT');
 }catch(e){await setup.query('ROLLBACK');throw e;}finally{setup.release();}
 return {
  async connect(){
   const client=await pool.connect();
   try{await client.query('SET search_path TO perpl, pg_catalog');return client;}
   catch(e){client.release();throw e;}
  },
  async query(sql,args){const client=await this.connect();try{return await client.query(sql,args);}finally{client.release();}},
  end:()=>pool.end(),
 };
}
