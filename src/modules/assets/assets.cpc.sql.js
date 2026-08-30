'use strict';

/**
 * The CPC breakdown queries.
 *
 * An asset's classification can come from three places, and which one holds it
 * depends on how far through prosecution it is: a granted patent is in
 * db_patent_application_bibliographic, a published-but-not-granted application
 * is in db_patent_grant_bibliographic, and the recorded-assignment corpus
 * carries its own copy. The breakdown unions all three and de-duplicates by
 * application number.
 *
 * The legacy code built these by string-replacing REPLACE_STRING and
 * GROUP_STRING markers into one of four query shells. The projection is the
 * same in every case, so it is written once here.
 */

const { cpcRangeExpression } = require('./assets.constants');

// One row per (filing year, CPC code): how many are granted, how many are still
// applications, and who they originate from.
const AGGREGATE_PROJECTION = `SUM(IF(patent_number != '' AND application_number > 0, 1, 0)) AS patent_number,
     SUM(IF(patent_number = '' AND application_number > 0, 1, 0)) AS application_number,
     GROUP_CONCAT(application_number) AS appNum,
     (SUM(IF(patent_number != '' AND application_number > 0, 1, 0))
      + SUM(IF(patent_number = '' AND application_number > 0, 1, 0))) AS countAssets,
     fillingYear, cpc_code, section, class, sub_class, main_group, sub_group,
     GROUP_CONCAT(DISTINCT origin SEPARATOR '@@ ') AS group_name`;

const GROUPING = 'GROUP BY fillingYear, cpc_code';

// The inventors behind an application, as recorded in the bibliographic data.
const INVENTOR_ORIGIN = (inventorTable, assignorTable) => `(SELECT GROUP_CONCAT(DISTINCT
      IF(representative_name <> '', representative_name, aaa.name) SEPARATOR '@@ ')
    FROM ${inventorTable} AS inv
    INNER JOIN ${assignorTable} AS aaa ON aaa.assignor_and_assignee_id = inv.assignor_and_assignee_id
    LEFT JOIN db_uspto.representative ON representative.representative_id = aaa.representative_id
   WHERE inv.appno_doc_num = application_cpc.application_number) AS origin`;

// The party an asset was originally assigned to by its inventors — an employer
// assignment (employer_assign = 1) is what makes it the origin.
const EMPLOYER_ORIGIN = `(SELECT GROUP_CONCAT(DISTINCT
      IF(representative_name <> '', representative_name, name) SEPARATOR '@@ ')
    FROM db_uspto.assignee
    INNER JOIN db_uspto.assignor_and_assignee
            ON assignor_and_assignee.assignor_and_assignee_id = assignee.assignor_and_assignee_id
    LEFT JOIN db_uspto.representative
           ON representative.representative_id = assignor_and_assignee.representative_id
    INNER JOIN db_uspto.representative_assignment_conveyance
            ON representative_assignment_conveyance.rf_id = assignee.rf_id
   WHERE assignee.rf_id IN (SELECT rf_id FROM db_uspto.documentid
                             WHERE documentid.appno_doc_num = application_cpc.application_number)
     AND representative_assignment_conveyance.employer_assign = 1) AS origin`;

/** The scope filter, if the caller narrowed to particular CPC codes. */
const scopeClause = ({ scope, rangeExpr, bySection }) => {
  if (!scope.length) return '';
  return bySection ? ' AND section IN (:scopeList) ' : ` AND ${rangeExpr} IN (:scopeList) `;
};

/**
 * The primary breakdown: granted patents from the assignment corpus, then the
 * grant index, then the publication index.
 */
const primaryBreakdown = ({ range, scope, bySection, yearClause, missedMonetization }) => {
  const rangeExpr = cpcRangeExpression(range);
  const scoped = scopeClause({ scope, rangeExpr, bySection });

  if (missedMonetization) {
    // These are assets we hold but never granted, so only the application-side
    // classification exists.
    return `SELECT ${AGGREGATE_PROJECTION} FROM (
        SELECT application_cpc.grant_doc_num AS patent_number,
               application_cpc.application_number,
               date_format(ag.appno_date, '%Y') AS fillingYear,
               ${rangeExpr} AS cpc_code, section, class, sub_class, main_group, sub_group,
               ${INVENTOR_ORIGIN('db_patent_application_bibliographic.inventor',
    'db_patent_application_bibliographic.assignor_and_assignee')}
          FROM db_patent_application_bibliographic.patent_cpc AS application_cpc
          INNER JOIN db_patent_application_bibliographic.application_grant AS ag
                  ON ag.grant_doc_num = application_cpc.grant_doc_num AND ag.appno_doc_num IN (:list)
         WHERE application_cpc.application_number IN (:list) AND application_cpc.type = 0
         ${scoped}) AS temp1 ${GROUPING} ORDER BY cpc_code DESC`;
  }

  return `SELECT ${AGGREGATE_PROJECTION} FROM (SELECT temp3.* FROM (
      SELECT temp.grant_doc_num AS patent_number, temp.appno_doc_num AS application_number,
             date_format(temp.appno_date, '%Y') AS fillingYear,
             ${rangeExpr} AS cpc_code, section, class, sub_class, main_group, sub_group,
             ${EMPLOYER_ORIGIN}
        FROM db_patent_application_bibliographic.patent_cpc AS application_cpc
        INNER JOIN (SELECT documentid.appno_doc_num, documentid.grant_doc_num, documentid.appno_date
                      FROM db_uspto.documentid AS documentid
                     WHERE date_format(documentid.appno_date, '%Y') ${yearClause}
                       AND documentid.appno_doc_num IN (:list) AND documentid.grant_doc_num <> ''
                     GROUP BY documentid.appno_doc_num) AS temp
                ON temp.appno_doc_num = application_cpc.application_number
       WHERE application_cpc.type = 0 ${scoped}
       GROUP BY temp.appno_doc_num
      UNION
      SELECT application_grant.grant_doc_num, application_grant.appno_doc_num,
             date_format(application_grant.appno_date, '%Y'),
             ${rangeExpr}, section, class, sub_class, main_group, sub_group, '' AS origin
        FROM db_patent_application_bibliographic.patent_cpc AS application_cpc
        INNER JOIN db_patent_application_bibliographic.application_grant AS application_grant
                ON application_grant.appno_doc_num = application_cpc.application_number
               AND application_cpc.application_number IN (:list)
       WHERE date_format(application_grant.appno_date, '%Y') ${yearClause}
         AND application_grant.appno_doc_num IN (:list) AND application_grant.grant_doc_num <> ''
         AND application_cpc.type = 0 ${scoped}
       GROUP BY application_grant.appno_doc_num
      UNION
      SELECT '' AS patent_number, application_publication.appno_doc_num,
             date_format(application_publication.appno_date, '%Y'),
             ${rangeExpr}, section, class, sub_class, main_group, sub_group, '' AS origin
        FROM db_patent_grant_bibliographic.application_cpc AS application_cpc
        INNER JOIN db_patent_grant_bibliographic.application_publication AS application_publication
                ON application_publication.appno_doc_num = application_cpc.application_number
               AND application_cpc.application_number IN (:list)
       WHERE date_format(application_publication.appno_date, '%Y') ${yearClause}
         AND application_publication.appno_doc_num IN (:list) AND application_cpc.type = 0 ${scoped}
       GROUP BY application_publication.appno_doc_num) AS temp3
    GROUP BY temp3.application_number) AS temp1 ${GROUPING} ORDER BY cpc_code DESC`;
};

/**
 * The second pass, over assets the first pass did not classify — their
 * classification lives only in the publication index.
 */
const fallbackBreakdown = ({ range, scope, bySection, yearClause, missedMonetization }) => {
  const rangeExpr = cpcRangeExpression(range);
  const scoped = scopeClause({ scope, rangeExpr, bySection });

  if (missedMonetization) {
    return `SELECT ${AGGREGATE_PROJECTION} FROM (
        SELECT '' AS patent_number, application_cpc.application_number,
               date_format(ap.appno_date, '%Y') AS fillingYear,
               ${rangeExpr} AS cpc_code, section, class, sub_class, main_group, sub_group,
               ${INVENTOR_ORIGIN('db_patent_grant_bibliographic.inventor_new',
    'db_patent_application_bibliographic.assignor_and_assignee')}
          FROM db_patent_grant_bibliographic.application_cpc AS application_cpc
          INNER JOIN db_patent_grant_bibliographic.application_publication AS ap
                  ON ap.appno_doc_num = application_cpc.application_number AND ap.appno_doc_num IN (:list)
         WHERE application_cpc.application_number IN (:list) AND application_cpc.type = 0
         ${scoped}) AS temp1 ${GROUPING} ORDER BY cpc_code DESC`;
  }

  return `SELECT ${AGGREGATE_PROJECTION} FROM (
      SELECT temp.grant_doc_num AS patent_number, temp.appno_doc_num AS application_number,
             date_format(temp.appno_date, '%Y') AS fillingYear,
             ${rangeExpr} AS cpc_code, section, class, sub_class, main_group, sub_group,
             ${EMPLOYER_ORIGIN}
        FROM db_patent_grant_bibliographic.application_cpc AS application_cpc
        INNER JOIN (SELECT documentid.appno_doc_num, documentid.grant_doc_num, documentid.appno_date
                      FROM db_uspto.documentid AS documentid
                     WHERE date_format(documentid.appno_date, '%Y') ${yearClause}
                       AND documentid.appno_doc_num IN (:list)
                     GROUP BY documentid.appno_doc_num) AS temp
                ON temp.appno_doc_num = application_cpc.application_number
       WHERE application_cpc.type = 0 ${scoped}
       GROUP BY temp.appno_doc_num) AS temp1 ${GROUPING} ORDER BY cpc_code DESC`;
};

/** The assets inside one (year, CPC code) cell of the breakdown. */
const assetsInCpcCell = (range) => {
  const rangeExpr = cpcRangeExpression(range);
  const source = (cpcTable, grantPredicate) => `SELECT temp.grant_doc_num, temp.appno_doc_num,
        temp.title, ${rangeExpr} AS cpc_code
     FROM ${cpcTable} AS application_cpc
     INNER JOIN (SELECT documentid.grant_doc_num, documentid.appno_doc_num,
                        documentid.appno_date, documentid.title
                   FROM db_uspto.documentid AS documentid
                  WHERE date_format(appno_date, '%Y') = :year
                    AND documentid.appno_doc_num IN (:list) AND documentid.grant_doc_num ${grantPredicate}
                  GROUP BY documentid.appno_doc_num) AS temp
             ON temp.appno_doc_num = application_cpc.application_number
    WHERE application_cpc.type = 0 AND ${rangeExpr} = :cpcCode
    GROUP BY temp.appno_doc_num`;

  return `SELECT ROW_NUMBER() OVER () AS id,
      CASE WHEN grant_doc_num != '' THEN grant_doc_num ELSE appno_doc_num END AS asset,
      CASE WHEN grant_doc_num = '' THEN 1 ELSE 0 END AS asset_type,
      grant_doc_num, appno_doc_num, title, temp1.cpc_code AS cpc_code,
      (SELECT title FROM db_patent_grant_bibliographic.cpc_defination AS cpc_defination
        WHERE cpc_defination.cpc_code = temp1.cpc_code) AS defination
    FROM (${source('db_patent_application_bibliographic.patent_cpc', "<> ''")}
          UNION
          ${source('db_patent_grant_bibliographic.application_cpc', "= ''")}) AS temp1
    GROUP BY appno_doc_num`;
};

module.exports = { primaryBreakdown, fallbackBreakdown, assetsInCpcCell, scopeClause };
