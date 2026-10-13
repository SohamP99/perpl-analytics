import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {PostgresStore} from '../cloud/postgres-store.mjs';
import {SummaryEngine} from '../indexer/summary-engine.mjs';
import {CACHE_BYTES,CACHE_ENTRIES,CACHE_ENTRY_BYTES,cacheKey,publicCacheHeaders} from '../cloud/cache-policy.mjs';
const pg=new PGlite(),pool={query:async(sql,args)=>!args&&sql.split(';').filter(s=>s.trim()).length>1?(await pg.exec(sql)).at(-1):pg.query(sql,args),connect:async()=>({...pool,release(){}}),end:()=>pg.close()};
const store=new PostgresStore(pool);await store.init();
try{
 const path='/v1/market-data/1/candles/86400/1770000000000-1790000000000',next=path.replace('1790000000000','1790000300000');
 assert.equal(cacheKey(path),cacheKey(next));
 await store.saveCache(path,{d:[1]});assert.deepEqual((await store.cache(path)).data,{d:[1]});assert.equal(await store.cache(next),null,'different requested range must never get the old response');
 await store.saveCache(next,{d:[2]});assert.equal((await pool.query('SELECT count(*) n FROM api_cache')).rows[0].n,1);assert.equal(await store.cache(path),null);
 // Exercise eviction against legacy rows and current writes, without 512 queries.
 await pool.query(`INSERT INTO api_cache(path,data,time,cache_bytes) SELECT 'wallet:'||n,'{}'::jsonb,$1::bigint-n,20000 FROM generate_series(1,600) n`,[Date.now()]);
 await store.saveCache('wallet:new',{balance:1});
 const size=(await pool.query('SELECT count(*) n,sum(cache_bytes) bytes FROM api_cache')).rows[0];assert.ok(size.n<=CACHE_ENTRIES);assert.ok(Number(size.bytes)<=CACHE_BYTES);
 assert.equal(await store.saveCache('huge',{v:'x'.repeat(CACHE_ENTRY_BYTES)}),false);
 const bytes=store.storageBytes.bind(store);store.storageBytes=async()=>400*1024*1024;
 assert.equal(await store.saveCache('full',{balance:2}),false);assert.equal(await store.cache('full'),null);
 await store.acquire('test');const start=await store.get('next'),hash=await store.get('hash');
 await assert.rejects(()=>store.commit({start,end:start,hash,firstParentHash:hash,time:Date.now(),rows:[]},'test'),/storage safety/);assert.equal(await store.get('next'),start,'full database cannot advance the checkpoint');await store.release('test');store.storageBytes=bytes;
 const oldFetch=globalThis.fetch;globalThis.fetch=async()=>({ok:true,json:async()=>({fresh:1})});
 try{const engine=new SummaryEngine({cache:async()=>null,saveCache:async()=>false});assert.deepEqual((await engine.publicRead('/v1/pub/context')).data,{fresh:1},'live response survives a skipped disposable cache write');}finally{globalThis.fetch=oldFetch;}
 for(const path of ['/api/local/wallet/0x'+'a'.repeat(40),'/api/refresh','/api/local/status'])assert.equal(publicCacheHeaders(new URL(path,'https://x.test'),200)['Cache-Control'],'no-store');
 assert.equal(publicCacheHeaders(new URL('/api/local/protocol','https://x.test'),502)['Cache-Control'],'no-store');
 assert.match(publicCacheHeaders(new URL('/api/local/protocol','https://x.test'),200)['Vercel-CDN-Cache-Control'],/s-maxage=/);
 console.log('PASS: bounded byte/entry caches, canonical candle replacement, no range contamination, storage guard preserves checkpoint, uncached live fallback, public-only CDN policy.');
}finally{await store.close();}
