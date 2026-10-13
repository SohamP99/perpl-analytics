export const CACHE_BYTES=8*1024*1024;
export const CACHE_ENTRIES=512;
export const CACHE_ENTRY_BYTES=1024*1024;
export const CACHE_RETENTION=2*86400000;
// One slot per market/resolution/start. The original request is checked on read,
// so a different end cannot accidentally receive the previous range's data.
export function cacheKey(path){return path.replace(/^(\/v1\/market-data\/\d+\/candles\/\d+\/\d+)-\d+$/,'$1-latest');}
export function storageLimit(env=process.env){const n=Number(env.PERPL_CLOUD_STORAGE_LIMIT_MB||400);if(!Number.isFinite(n)||n<1)throw Error('Invalid cloud storage limit');return Math.min(n,400)*1024*1024;}
export function publicCacheHeaders(url,status,now=Date.now()){
 if(status!==200||url.pathname.includes('/wallet/')||url.pathname.endsWith('/status')||url.searchParams.has('refresh'))return {'Cache-Control':'no-store'};
 const shareable=/^\/api\/local\/(protocol|market-snapshot|leaderboard|liquidations|funding-history)$/.test(url.pathname)||url.pathname.startsWith('/api/perpl/');
 if(!shareable)return {'Cache-Control':'no-store'};
 // Expire just after the next scheduled job's bounded runtime, without SWR.
 const ttl=Math.max(1,Math.min(300,Math.ceil(((Math.floor(now/300000)+1)*300000+25000-now)/1000)));
 return {'Cache-Control':'public, max-age=0, must-revalidate','Vercel-CDN-Cache-Control':`public, s-maxage=${ttl}`};
}
