'use strict';

/**
 * Chart SQL, transcribed verbatim from the legacy charts route (run against the
 * application database). Each entry pairs the query with its employer_assign
 * bind value. Only the whitespace was normalised; the SQL is unchanged.
 */

const INVENTOR =
  "Select date_format(exec_dt,'%m-%Y') as label1, exec_dt as label, count(or.rf_id) as value, sum(temp1.assets) as assets FROM assignor as `or` INNER JOIN (SELECT  or.rf_id, (select count(d.appno_doc_num) FROM documentid as d where d.rf_id = or.rf_id) as assets from assignor as `or` INNER JOIN (SELECT ee.rf_id FROM assignee as ee INNER JOIN assignment_conveyance as ac ON ac.rf_id = ee.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = ee.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE (r.representative_name IN (:names) OR aaa.name IN (:names)) AND ac.employer_assign = :employerAssign AND ac.convey_ty IN ('partialassignment', 'assignment', 'employee')) as temp ON temp.rf_id = or.rf_id GROUP BY or.rf_id) as temp1 ON temp1.rf_id = `or`.rf_id  GROUP BY label1";

const ACQUISITION =
  "Select date_format(exec_dt,'%m-%Y') as label1, exec_dt as label , count(or.rf_id) as value, sum(temp1.assets) as assets FROM assignor as `or` INNER JOIN (SELECT or.rf_id, (select count(d.appno_doc_num) FROM documentid as d where d.rf_id = or.rf_id) as assets from assignor as `or` INNER JOIN (SELECT ee.rf_id FROM assignee as ee INNER JOIN assignment_conveyance as ac ON ac.rf_id = ee.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = ee.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE (r.representative_name IN (:names) OR aaa.name IN (:names)) AND ac.employer_assign = :employerAssign AND ac.convey_ty IN ('partialassignment','assignment')) as temp ON temp.rf_id = or.rf_id GROUP BY or.rf_id) as temp1 ON temp1.rf_id = `or`.rf_id GROUP BY label1";

const SALES =
  "Select exec_dt as label , count(or.rf_id) as value, sum(temp1.assets) as assets FROM assignor as `or` INNER JOIN (SELECT ee.rf_id, (select count(d.appno_doc_num) FROM documentid as d where d.rf_id = ee.rf_id) as assets from assignee as `ee` INNER JOIN (SELECT or.rf_id FROM assignor as `or` INNER JOIN assignment_conveyance as ac ON ac.rf_id = or.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = or.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE (r.representative_name IN (:names) OR aaa.name IN (:names)) AND ac.employer_assign = :employerAssign AND ac.convey_ty IN ('partialassignment','assignment')) as temp ON temp.rf_id = ee.rf_id GROUP BY ee.rf_id) as temp1 ON temp1.rf_id = `or`.rf_id GROUP BY label";

const SECURITY =
  "Select exec_dt as label , count(or.rf_id) as value, sum(temp1.assets) as assets FROM assignor as `or` INNER JOIN (SELECT ee.rf_id, (select count(d.appno_doc_num) FROM documentid as d where d.rf_id = ee.rf_id) as assets from assignee as `ee` INNER JOIN (SELECT or.rf_id FROM assignor as `or` INNER JOIN assignment_conveyance as ac ON ac.rf_id = or.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = or.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE (r.representative_name IN (:names) OR aaa.name IN (:names)) AND ac.employer_assign = :employerAssign AND ac.convey_ty IN ('security', 'restatedsecurity')) as temp ON temp.rf_id = ee.rf_id GROUP BY ee.rf_id) as temp1 ON temp1.rf_id = `or`.rf_id GROUP BY label";

const SECURITY_PER_ASSIGNEE =
  "SELECT CASE WHEN r1.representative_name = null THEN aa.name ELSE r1.representative_name END entityName, ((select count(d.appno_doc_num) FROM documentid as d where d.rf_id = ee.rf_id)) as assets, (select ass.exec_dt FROM assignor as ass where ass.rf_id = ee.rf_id GROUP BY rf_id ) as label, count(ee.rf_id) as value from assignee as `ee` INNER JOIN assignor_and_assignee as aa ON aa.assignor_and_assignee_id = ee.assignor_and_assignee_id LEFT JOIN representative as r1 ON r1.representative_id = aa.representative_id INNER JOIN (SELECT or.rf_id FROM assignor as `or` INNER JOIN assignment_conveyance as ac ON ac.rf_id = or.rf_id INNER JOIN assignor_and_assignee as aaa ON aaa.assignor_and_assignee_id = or.assignor_and_assignee_id LEFT JOIN representative as r ON r.representative_id = aaa.representative_id WHERE (r.representative_name IN (:names) OR aaa.name IN (:names)) AND ac.employer_assign = :employerAssign AND ac.convey_ty IN ('security', 'restatedsecurity')) as temp ON temp.rf_id = ee.rf_id GROUP BY  entityName, label";

// type -> { sql, employerAssign }
module.exports = {
  1: { sql: INVENTOR, employerAssign: 1 },
  2: { sql: ACQUISITION, employerAssign: 0 },
  3: { sql: SALES, employerAssign: 0 },
  4: { sql: SECURITY, employerAssign: 0 },
  5: { sql: SECURITY_PER_ASSIGNEE, employerAssign: 0 },
};
