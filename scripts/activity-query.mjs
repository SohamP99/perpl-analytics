import {abi,EXCHANGE} from '../indexer/chain.mjs';
import {boundary} from '../indexer/summary-spec.mjs';
export function activityQuery(start,end){
 const topics=names=>names.map(n=>abi.getEvent(n).topicHash).join(',\n          ');
 const filter=`l.contract_address = ${EXCHANGE}
      AND l.block_time >= TIMESTAMP '${start} 00:00:00'
      AND l.block_time < TIMESTAMP '${end} 00:00:00'
      AND l.block_number >= ${boundary.fromBlock}
      AND l.block_number < ${boundary.toBlockExclusive}`;
 return `-- Perpl | Daily trading-account activity | ${start} to ${end} exclusive
-- Fixed dates and blocks. No parameters, sampling or result LIMIT.
-- Makers carry account IDs directly. Takers inherit the nearest preceding
-- OrderRequest in the SAME transaction, including batched multi-account orders.
WITH maker_daily AS (
    SELECT CAST(l.block_time AS DATE) AS day,
           CAST(varbinary_to_uint256(varbinary_substring(l.data, 33, 32)) AS VARCHAR) AS account_id,
           COUNT(*) AS fill_events
    FROM monad.logs l
    WHERE ${filter}
      AND l.topic0 IN (
          ${topics(['MakerOrderFilled','MakerOrderFilledV2'])})
    GROUP BY 1, 2
), takers AS (
    SELECT l.block_time, l.block_number, l.tx_hash, l."index" AS log_index
    FROM monad.logs l
    WHERE ${filter}
      AND l.topic0 IN (
          ${topics(['TakerOrderFilled','TakerOrderFilledV2'])})
), taker_transactions AS (
    SELECT block_time, block_number, tx_hash
    FROM takers GROUP BY 1, 2, 3
), requests AS (
    SELECT l.block_time, l.block_number, l.tx_hash, l."index" AS log_index,
           CAST(varbinary_to_uint256(varbinary_substring(l.data, 33, 32)) AS VARCHAR) AS account_id
    FROM monad.logs l
    JOIN taker_transactions t
      ON l.block_number = t.block_number AND l.tx_hash = t.tx_hash
     AND l.block_time = t.block_time
    WHERE ${filter}
      AND l.topic0 IN (
          ${topics(['OrderRequest','OrderRequestV2'])})
), context_rows AS (
    SELECT block_time, block_number, tx_hash, log_index, account_id, false AS is_fill
    FROM requests
    UNION ALL
    SELECT block_time, block_number, tx_hash, log_index, CAST(NULL AS VARCHAR), true
    FROM takers
), attributed AS (
    SELECT block_time, is_fill,
           LAST_VALUE(account_id) IGNORE NULLS OVER (
               PARTITION BY block_number, tx_hash ORDER BY log_index
               ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
           ) AS account_id
    FROM context_rows
), taker_daily AS (
    SELECT CAST(block_time AS DATE) AS day, account_id, COUNT(*) AS fill_events
    FROM attributed WHERE is_fill GROUP BY 1, 2
), combined AS (
    SELECT day, account_id, fill_events FROM maker_daily
    UNION ALL
    SELECT day, account_id, fill_events FROM taker_daily
), daily AS (
    SELECT day, account_id, SUM(fill_events) AS fill_events
    FROM combined GROUP BY 1, 2
)
SELECT day, account_id, fill_events,
       COUNT(*) OVER () AS export_rows,
       SUM(fill_events) OVER () AS source_fills,
       DATE '${start}' AS window_start,
       DATE '${end}' AS window_end_exclusive
FROM daily;
`;
}
