// Product coverage begins in the protocol's launch month, never before it.
export const HISTORY_START = Date.UTC(2026, 1, 1);
export type VolumeBucket = '1D' | '7D' | '1M';
export function bucketVolume(data: {t:number,v:number}[], interval: string) {
  const buckets = new Map<number,number>();
  for (const {t,v} of data) {
    if (t < HISTORY_START || !Number.isFinite(t) || !Number.isFinite(v)) continue;
    const date = new Date(t);
    let start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    if (interval === '1M') start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
    if (interval === '7D') start -= ((date.getUTCDay()+6)%7)*86400000;
    start = Math.max(HISTORY_START, start);
    buckets.set(start, (buckets.get(start) || 0)+v);
  }
  return [...buckets].sort((a,b)=>a[0]-b[0]).map(([t,v])=>({t,v}));
}
export function historyWindow(period: string, end = Date.now()) {
  const resolution = period === '24H' ? 3600 : 86400;
  const days = period === '24H' ? 1 : period === '7D' ? 7 : 30;
  const from = period === 'ALL' ? HISTORY_START : Math.max(HISTORY_START, Math.floor((end - days * 86400000) / (resolution * 1000)) * resolution * 1000);
  return {from, end, resolution};
}
