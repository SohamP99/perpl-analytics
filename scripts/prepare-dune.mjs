import {mkdirSync,writeFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {EXCHANGE,abi,eventNames} from '../indexer/chain.mjs';
const out=new URL('../../../outputs/dune/',import.meta.url);mkdirSync(out,{recursive:true});
const db=new DatabaseSync(new URL('../.perpl-data/index.sqlite',import.meta.url),{readOnly:true});
db.exec('BEGIN');
const from=JSON.parse(db.prepare("SELECT value FROM meta WHERE key='next'").get().value);
const to=db.prepare('SELECT MIN(start) n FROM future_batches').get().n;
db.exec('COMMIT');db.close();
if(!Number.isSafeInteger(to)||to<=from)throw Error('No verified gap before Spectrum data');
const values=eventNames.map(name=>`        (${abi.getEvent(name).topicHash}, '${name}', ${name.startsWith('OrderRequest')?'true':'false'})`).join(',\n');
const header=`-- Perpl Pulse / Monad MAINNET. Prepared ${new Date().toISOString()}.
-- Dune Number parameters: from_block (inclusive), to_block (EXCLUSIVE).
-- Snapshot missing range: [${from}, ${to}).
-- First test: from_block=${from}, to_block=${Math.min(from+10000,to)}.
-- Count the gap first; pilot size suggests initially <=10,000 blocks per export.
-- The current app may advance meanwhile; overlap is safe after validated import.
-- This SQL has not been executed in your Dune account.
-- Never use a LIMIT, sampling, or partial-results flag for a full export.
`;
const cte=`WITH event_types (topic_hash, event_name, is_context) AS (
    VALUES
${values}
), selected_logs AS (
    SELECT l.block_time, l.block_number, l.block_hash, l.tx_hash,
           l."index" AS log_index, l.contract_address,
           l.topic0, l.topic1, l.topic2, l.topic3, l.data,
           t.event_name, t.is_context
    FROM monad.logs l
    JOIN event_types t ON l.topic0 = t.topic_hash
    WHERE l.contract_address = ${EXCHANGE}
      AND l.block_time >= TIMESTAMP '2026-07-01 00:00:00'
      AND l.block_time < TIMESTAMP '2026-10-14 00:00:00'
      AND l.block_number >= CAST({{from_block}} AS BIGINT)
      AND l.block_number < CAST({{to_block}} AS BIGINT)
), attributed_context AS (
    SELECT *, MAX(CASE WHEN event_name IN ('TakerOrderFilled', 'TakerOrderFilledV2') THEN 1 ELSE 0 END)
        OVER (PARTITION BY block_number, tx_hash) AS has_taker_fill
    FROM selected_logs
), export_logs AS (
    SELECT * FROM attributed_context
    WHERE NOT is_context OR has_taker_fill = 1
)
`;
const columns=`    block_number,
    CAST(to_unixtime(block_time) AS BIGINT) AS block_timestamp,
    concat('0x', lower(to_hex(block_hash))) AS block_hash,
    concat('0x', lower(to_hex(tx_hash))) AS transaction_hash,
    log_index,
    concat('0x', lower(to_hex(contract_address))) AS address,
    concat('0x', lower(to_hex(topic0))) AS topic0,
    CASE WHEN topic1 IS NULL THEN NULL ELSE concat('0x', lower(to_hex(topic1))) END AS topic1,
    CASE WHEN topic2 IS NULL THEN NULL ELSE concat('0x', lower(to_hex(topic2))) END AS topic2,
    CASE WHEN topic3 IS NULL THEN NULL ELSE concat('0x', lower(to_hex(topic3))) END AS topic3,
    concat('0x', lower(to_hex(data))) AS data,
    event_name`;
writeFileSync(new URL('01-export-perpl-gap.sql',out),header+cte+'SELECT\n'+columns+'\nFROM export_logs\nORDER BY block_number, log_index;\n');
writeFileSync(new URL('02-check-export-count.sql',out),header+cte+`SELECT
    CAST({{from_block}} AS BIGINT) AS requested_from_inclusive,
    CAST({{to_block}} AS BIGINT) AS requested_to_exclusive,
    COUNT(*) AS expected_export_rows,
    COUNT_IF(NOT is_context) AS financial_event_rows,
    COUNT_IF(is_context) AS required_context_rows,
    COUNT(DISTINCT tx_hash) AS transactions_with_exported_logs,
    MIN(block_number) AS first_event_block,
    MAX(block_number) AS last_event_block,
    MIN(block_time) AS first_event_time,
    MAX(block_time) AS last_event_time,
    COALESCE(SUM(length(data)), 0) AS raw_data_bytes_only
FROM export_logs;
-- raw_data_bytes_only excludes topics, hashes and CSV/JSON overhead.
-- Counts validate export completeness, not Dune's upstream ingestion completeness.
`);
writeFileSync(new URL('03-schema-check.sql',out),`-- Optional: check table/column availability before the larger query.
-- This is a SCHEMA SAMPLE ONLY, never a complete import.
SELECT block_time, block_number, block_hash, tx_hash, "index" AS log_index,
       contract_address, topic0, topic1, topic2, topic3, data
FROM monad.logs
WHERE contract_address = ${EXCHANGE}
  AND block_time >= TIMESTAMP '2026-07-01 00:00:00'
  AND block_time < TIMESTAMP '2026-10-14 00:00:00'
  AND block_number >= ${from}
  AND block_number < ${Math.min(from+10000,to)}
LIMIT 20;
`);
writeFileSync(new URL('gap-snapshot.json',out),JSON.stringify({generatedAt:new Date().toISOString(),chainId:143,contract:EXCHANGE,fromBlockInclusive:from,toBlockExclusive:to,pilotToBlockExclusive:Math.min(from+10000,to),topics:eventNames.map(name=>({name,topic:abi.getEvent(name).topicHash,context:name.startsWith('OrderRequest')}))},null,2)+'\n');
console.log(JSON.stringify({fromBlock:from,toBlockExclusive:to,pilotEnd:Math.min(from+10000,to),files:4}));
