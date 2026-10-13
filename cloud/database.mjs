// Use a private schema, outside Supabase's public REST API.
// SET LOCAL is transaction-scoped so Supabase's transaction pooler is safe.
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
   return {
    async query(sql,args){
     const result=await client.query(sql,args);
     if(/^BEGIN\b/i.test(sql))await client.query('SET LOCAL search_path TO perpl, pg_catalog');
     return result;
    },
    release:()=>client.release(),
   };
  },
  async query(sql,args){const client=await this.connect();try{await client.query('BEGIN');const result=await client.query(sql,args);await client.query('COMMIT');return result;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}},
  end:()=>pool.end(),
 };
}
