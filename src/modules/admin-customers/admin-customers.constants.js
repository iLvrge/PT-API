'use strict';

/**
 * The report tables behind GET /customers/run_query/:name/:query_no.
 *
 * A query number selects a table and the column to read from it. Both come
 * from this map, never from the request, so nothing the caller sends reaches
 * the SQL as an identifier.
 */
const REPORT_QUERIES = {
  1: { table: 'db_uspto.list1', column: 'assignor_and_assignee_id', byName: true },
  2: { table: 'db_uspto.list2', column: 'rf_id', byName: true },
  3: { table: 'db_new_application.assets', column: '*', layoutId: 15 },
  4: { table: 'db_uspto.table_b', column: 'appno_doc_num' },
  5: { table: 'db_uspto.table_c', column: 'appno_doc_num' },
  6: { table: 'db_new_application.assets', column: '*', layoutId: 1 },
  7: { table: 'db_new_application.assets', column: '*', layoutId: 4 },
};

/**
 * How each report's ids are turned into the asset list the client renders.
 * Numbers 6 and 7 read the asset table directly and need no second hop.
 */
const REPORT_EXPANSIONS = {
  // Parties: every asset on any transaction they were a party to.
  1: (inner) => `SELECT * FROM (
        SELECT appno_doc_num, grant_doc_num FROM documentid
         WHERE rf_id IN (SELECT rf_id FROM assignor
                          WHERE assignor_and_assignee_id IN (${inner}) GROUP BY rf_id)
        UNION
        SELECT appno_doc_num, grant_doc_num FROM documentid
         WHERE rf_id IN (SELECT rf_id FROM assignee
                          WHERE assignor_and_assignee_id IN (${inner}) GROUP BY rf_id)
      ) AS temp GROUP BY appno_doc_num`,
  // Transactions: the assets they cover.
  2: (inner) => `SELECT appno_doc_num, grant_doc_num FROM documentid
                  WHERE rf_id IN (${inner}) GROUP BY appno_doc_num`,
  4: (inner) => `SELECT appno_doc_num, grant_doc_num FROM documentid
                  WHERE appno_doc_num IN (${inner}) GROUP BY appno_doc_num`,
  5: (inner) => `SELECT appno_doc_num, grant_doc_num FROM documentid
                  WHERE appno_doc_num IN (${inner}) GROUP BY appno_doc_num`,
};

// The admin users all live in this organisation, with this type.
const ADMIN_ORGANISATION_ID = 3;
const ADMIN_TYPE = '9';
const ADMIN_ROLE_ID = 1;

// Where the normalisation scripts leave their output.
const ENTITY_FILE_PREFIX = 'normalizeNames_';

module.exports = {
  REPORT_QUERIES,
  REPORT_EXPANSIONS,
  ADMIN_ORGANISATION_ID,
  ADMIN_TYPE,
  ADMIN_ROLE_ID,
  ENTITY_FILE_PREFIX,
};
