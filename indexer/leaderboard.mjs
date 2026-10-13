export const LEADERBOARD_PATH='/v1/trading/leaderboard/all/vol';
export function leaderboardWallet(snapshot,address){
 const {data,at,stale}=snapshot;
 if(!Array.isArray(data?.d)||!Number.isFinite(data.at?.t))throw Error('Invalid Perpl leaderboard response');
 const row=data.d.find(r=>typeof r.a==='string'&&r.a.toLowerCase()===address.toLowerCase());
 const base={found:!!row,period:'all',source:'Perpl public leaderboard',sourceAt:data.at.t,fetchedAt:at,stale:!!stale};
 if(!row)return base;
 if(!/^-?\d+$/.test(row.p)||!/^\d+$/.test(row.v)||!Number.isFinite(row.r)||!Number.isSafeInteger(row.i))throw Error('Invalid Perpl leaderboard values');
 return {...base,pnl:Number(row.p)/1e6,volume:Number(row.v)/1e6,roi:row.r/100,volumeRank:row.i};
}
