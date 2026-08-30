'use strict';

const { connections } = require('../../db');
const q = require('../../db/query');

const RESULT_LIMIT = 100;

// Only transactions visible to the shared (organisation_id 0 / NULL) partition
// are searchable — the legacy scoping, preserved.
const VISIBLE_TRANSACTIONS = `SELECT rf_id FROM db_uspto.representative_transactions
   WHERE (organisation_id = :orgId OR organisation_id IS NULL)`;

const ASSET_COUNT = `(SELECT count(*) FROM documentid AS dd WHERE dd.rf_id = %ALIAS%.rf_id)`;

/** Transactions whose counterparty matches, by name or by rf_id. */
const byParty = (searchString, numeric) =>
  q.selectAll(
    connections.application,
    `SELECT tpc.rf_id as rf_id, date_format(tpc.exec_dt,'%m/%d/%Y') as date,
            ${ASSET_COUNT.replace('%ALIAS%', 'tpc')} as assets
       FROM tree_parties as tp
       INNER JOIN tree_parties_collection as tpc
               ON tp.assignor_and_assignee_id = tpc.assignor_and_assignee_id
      WHERE tpc.rf_id IN (${VISIBLE_TRANSACTIONS})
        AND ${numeric ? 'tpc.rf_id = :searchItem' : 'MATCH(tp.name) AGAINST (:searchItem)'}
      GROUP BY tpc.rf_id LIMIT :limit`,
    { searchItem: searchString, orgId: 0, limit: RESULT_LIMIT }
  );

/** Transactions whose recording correspondent matches. */
const byCorrespondent = (searchString) =>
  q.selectAll(
    connections.application,
    `SELECT a.rf_id as rf_id,
            (SELECT date_format(exec_dt,'%m/%d/%Y') FROM assignor
              WHERE assignor.rf_id = a.rf_id LIMIT 1) as date,
            ${ASSET_COUNT.replace('%ALIAS%', 'a')} as assets
       FROM assignment as a
      WHERE a.rf_id IN (${VISIBLE_TRANSACTIONS})
        AND MATCH(a.cname, a.caddress_1) AGAINST (:searchItem)
      GROUP BY a.rf_id LIMIT :limit`,
    { searchItem: searchString, orgId: 0, limit: RESULT_LIMIT }
  );

/** Transactions carrying a matching application or patent number. */
const byDocument = (searchString, numeric) =>
  q.selectAll(
    connections.application,
    `SELECT d.rf_id as rf_id,
            (SELECT date_format(exec_dt,'%m/%d/%Y') FROM assignor
              WHERE assignor.rf_id = d.rf_id LIMIT 1) as date,
            ${ASSET_COUNT.replace('%ALIAS%', 'd')} as assets
       FROM documentid as d
      WHERE d.rf_id IN (${VISIBLE_TRANSACTIONS})
        AND ${numeric
    ? '(d.appno_doc_num = :searchItem OR d.grant_doc_num = :searchItem)'
    : 'd.grant_doc_num = :searchItem'}
      GROUP BY d.rf_id LIMIT :limit`,
    { searchItem: searchString, orgId: 0, limit: RESULT_LIMIT }
  );

module.exports = { byParty, byCorrespondent, byDocument, RESULT_LIMIT };
