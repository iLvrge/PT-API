'use strict';

/**
 * The reports behind GET /customers/run_query/:name/:query_no.
 *
 * A query number selects a stored procedure, the table it fills and the column
 * to read back. All three come from this map, never from the request, so
 * nothing the caller sends reaches the SQL as an identifier.
 *
 * `procedure` is the half that was missing: these tables are scratch space that
 * only holds what the last run left there, so reading without calling first
 * returns another user's rows or, far more often, nothing at all. Every one of
 * these reports came back empty because of it.
 *
 * `withoutName` marks the two procedures that take (companyID, organisationID)
 * only - they work from the company, not a typed-in name.
 */
const REPORT_QUERIES = {
  1: { procedure: 'routine_list1', table: 'db_uspto.list1', column: 'assignor_and_assignee_id', byName: true },
  2: { procedure: 'routine_list2', table: 'db_uspto.list2', column: 'rf_id', byName: true },
  3: { procedure: 'routine_tableA', table: 'db_new_application.assets', column: '*', layoutId: 15 },
  4: { procedure: 'routine_tableB', table: 'db_uspto.table_b', column: 'appno_doc_num' },
  5: { procedure: 'routine_tableC', table: 'db_uspto.table_c', column: 'appno_doc_num' },
  6: {
    procedure: 'routine_broken_title', withoutName: true,
    table: 'db_new_application.assets', column: '*', layoutId: 1,
  },
  7: { procedure: 'routine_correct_details', table: 'db_new_application.assets', column: '*', layoutId: 4 },
  /*
   * Correct Chain was left out of the port entirely, so the console's eighth
   * report 400'd.
   *
   * It reads db_new_application.assets at layout_id 99, which is what
   * routine_correct_chain declares and writes. The legacy handler ran that
   * procedure and then read db_uspto.table_c with no layout filter - it carried
   * a `query_no === 8 ? 99` branch but placed it inside a condition that
   * excluded 8, so the branch never ran and the report showed table_c's
   * contents instead of its own. Following the procedure is the fix.
   */
  8: {
    procedure: 'routine_correct_chain', withoutName: true,
    table: 'db_new_application.assets', column: '*', layoutId: 99,
  },
};

/**
 * How each report's ids are turned into the asset list the client renders.
 * Numbers 6 and 7 read the asset table directly and need no second hop.
 */
const REPORT_EXPANSIONS = {
  // Parties: every asset on any transaction they were a party to. `inner`
  // selects `column` from the report table; it is joined rather than tested
  // with a membership subquery, because every one of these lands on
  // db_uspto.documentid, which has millions of rows. The outer GROUP BY
  // already collapses repeats, so a join cannot change the result.
  1: (inner, column) => `SELECT * FROM (
        SELECT d.appno_doc_num, d.grant_doc_num FROM documentid AS d
         INNER JOIN (SELECT DISTINCT aor.rf_id FROM assignor AS aor
                      INNER JOIN (${inner}) AS parties
                              ON parties.${column} = aor.assignor_and_assignee_id
                    ) AS assignedFrom ON assignedFrom.rf_id = d.rf_id
        UNION
        SELECT d.appno_doc_num, d.grant_doc_num FROM documentid AS d
         INNER JOIN (SELECT DISTINCT ass.rf_id FROM assignee AS ass
                      INNER JOIN (${inner}) AS parties
                              ON parties.${column} = ass.assignor_and_assignee_id
                    ) AS assignedTo ON assignedTo.rf_id = d.rf_id
      ) AS temp GROUP BY appno_doc_num`,
  // Transactions: the assets they cover.
  2: (inner, column) => `SELECT d.appno_doc_num, d.grant_doc_num FROM documentid AS d
                  INNER JOIN (${inner}) AS scope ON scope.${column} = d.rf_id
                  GROUP BY d.appno_doc_num`,
  4: (inner, column) => `SELECT d.appno_doc_num, d.grant_doc_num FROM documentid AS d
                  INNER JOIN (${inner}) AS scope ON scope.${column} = d.appno_doc_num
                  GROUP BY d.appno_doc_num`,
  5: (inner, column) => `SELECT d.appno_doc_num, d.grant_doc_num FROM documentid AS d
                  INNER JOIN (${inner}) AS scope ON scope.${column} = d.appno_doc_num
                  GROUP BY d.appno_doc_num`,
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
