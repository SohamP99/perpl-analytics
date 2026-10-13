import {activityQuery} from './activity-query.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import {abi,EXCHANGE} from '../indexer/chain.mjs';
import {summaryNames,offsets,boundary} from '../indexer/summary-spec.mjs';
const out=new URL('../../../outputs/dune-summaries/',import.meta.url);mkdirSync(out,{recursive:true});
const filter=`l.contract_address = ${EXCHANGE}
      AND l.block_time >= TIMESTAMP '2026-02-01 00:00:00'
      AND l.block_time < TIMESTAMP '2026-10-13 00:00:00'
      AND l.block_number >= 54773010
      AND l.block_number < ${boundary.toBlockExclusive}`;
const fields=['amount','fee','builder_fee','insurance_fee','protocol_fee'];
const q1=`-- Perpl | Historical daily flows, fees, liquidations and new accounts
-- Raw collateral units: divide *_cns by 1,000,000 for AUSD.
WITH specs (topic, event_name, amount_pos, fee_pos, builder_fee_pos, insurance_fee_pos, protocol_fee_pos) AS (
    VALUES
${summaryNames.map(n=>`    (${abi.getEvent(n).topicHash}, '${n}', ${offsets(n).join(', ')})`).join(',\n')}
), decoded AS (
    SELECT CAST(l.block_time AS DATE) AS day, s.event_name,
${fields.map(f=>`        CASE WHEN s.${f}_pos = 0 THEN DECIMAL '0' ELSE CAST(varbinary_to_uint256(varbinary_substring(l.data, s.${f}_pos, 32)) AS DECIMAL(38,0)) END AS ${f}`).join(',\n')}
    FROM monad.logs l JOIN specs s ON l.topic0 = s.topic
    WHERE ${filter}
), daily AS (
    SELECT day, event_name, COUNT(*) AS event_count,
${fields.map(f=>`        CAST(SUM(${f}) AS VARCHAR) AS ${f}_cns`).join(',\n')}
    FROM decoded GROUP BY 1, 2
)
SELECT *, COUNT(*) OVER () AS export_rows,
       SUM(event_count) OVER () AS source_events
FROM daily ORDER BY day, event_name;
`;
const q2=activityQuery('2026-02-01','2026-10-13');
const q3=`-- Perpl | Historical coverage boundary check
SELECT 54773010 AS from_block_inclusive,
       ${boundary.toBlockExclusive} AS to_block_exclusive,
       number AS last_historical_block,
       concat('0x', lower(to_hex(hash))) AS last_historical_hash,
       time AS last_historical_time,
       TIMESTAMP '2026-10-13 00:00:00' AS cutoff_utc
FROM monad.blocks
WHERE number = ${boundary.toBlockExclusive-1}
  AND time >= TIMESTAMP '2026-10-12 00:00:00'
  AND time < TIMESTAMP '2026-10-13 00:00:00';
`;
for(const [name,sql] of [['01-daily-protocol.sql',q1],['02-account-activity.sql',q2],['03-coverage.sql',q3]])writeFileSync(new URL(name,out),sql);
console.log('Prepared three fixed-boundary summary queries.');
