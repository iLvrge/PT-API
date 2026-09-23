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
 *
 * Which assets the breakdown covers arrives as a common table expression, not
 * as `appno_doc_num IN (:list)` - see assetListCte below.
 */

const { cpcRangeExpression } = require('./assets.constants');

/**
 * The asset list the breakdown runs over, as a CTE the queries join against.
 *
 * This used to be spliced in as `appno_doc_num IN (:list)`, repeated at up to
 * four points in a single statement. A real Avaya page selects 5,367 assets,
 * and at that size MySQL gives up on the index for the tested column - the
 * range optimiser exhausts its memory budget and falls back to scanning
 * multi-million-row tables - so the same request took anywhere from 6 s to
 * 23 s run to run. Joining a small derived table the optimiser can key
 * instead: 3.0 s, and stable across runs. Measured against the live data, with
 * every output column compared row for row against the old query.
 *
 * `body` must produce exactly two columns:
 *   appno       - latin1, for db_uspto.documentid, patent_cpc.application_number
 *                 and db_patent_grant_bibliographic.application_cpc
 *   appno_utf8  - utf8mb4_general_ci, for application_grant.appno_doc_num and
 *                 application_publication.appno_doc_num
 * Both carry the conversion so the indexed column on the other side never
 * does - see COLLATION.md. The repository builds these; the rows must already
 * be distinct, so a join can never multiply what a membership test matched
 * once.
 */
const assetListCte = (body) => `WITH asset_list AS (${body})\n`;

/*
 * One row per (filing year, CPC code): how many are granted, how many are still
 * applications, and who they originate from.
 *
 * The classification columns are aggregated rather than named bare. Only the
 * ones the chosen range builds cpc_code from are fixed within a group; a
 * coarse range leaves the rest holding several values (47 of the groups in a
 * 500-asset sample), and an un-aggregated column then returns whichever row the
 * join order happened to reach first. That was already true before the join was
 * rewritten - the value was stable only for as long as the plan was. MIN() is
 * the identity for a column the grouping does fix, and pins the rest.
 */
const AGGREGATE_PROJECTION = `SUM(IF(patent_number != '' AND application_number > 0, 1, 0)) AS patent_number,
     SUM(IF(patent_number = '' AND application_number > 0, 1, 0)) AS application_number,
     GROUP_CONCAT(application_number) AS appNum,
     (SUM(IF(patent_number != '' AND application_number > 0, 1, 0))
      + SUM(IF(patent_number = '' AND application_number > 0, 1, 0))) AS countAssets,
     fillingYear, cpc_code,
     MIN(section) AS section, MIN(class) AS class, MIN(sub_class) AS sub_class,
     MIN(main_group) AS main_group, MIN(sub_group) AS sub_group,
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
// documentid is joined, not tested with `rf_id IN (SELECT ...)`. That subquery
// was correlated on application_number, so MySQL re-ran it against a
// multi-million-row table for every row this projection produced. The join can
// repeat an assignee row where the membership test matched once, but the
// GROUP_CONCAT is DISTINCT, so the concatenated value is unchanged - verified
// identical across 60 real application numbers.
const EMPLOYER_ORIGIN = `(SELECT GROUP_CONCAT(DISTINCT
      IF(representative_name <> '', representative_name, name) SEPARATOR '@@ ')
    FROM db_uspto.assignee
    INNER JOIN db_uspto.documentid AS origin_doc
            ON origin_doc.rf_id = assignee.rf_id
           AND origin_doc.appno_doc_num = application_cpc.application_number
    INNER JOIN db_uspto.assignor_and_assignee
            ON assignor_and_assignee.assignor_and_assignee_id = assignee.assignor_and_assignee_id
    LEFT JOIN db_uspto.representative
           ON representative.representative_id = assignor_and_assignee.representative_id
    INNER JOIN db_uspto.representative_assignment_conveyance
            ON representative_assignment_conveyance.rf_id = assignee.rf_id
   WHERE representative_assignment_conveyance.employer_assign = 1) AS origin`;

/** The scope filter, if the caller narrowed to particular CPC codes. */
const scopeClause = ({ scope, rangeExpr, bySection }) => {
  if (!scope.length) return '';
  return bySection ? ' AND section IN (:scopeList) ' : ` AND ${rangeExpr} IN (:scopeList) `;
};

/**
 * The primary breakdown: granted patents from the assignment corpus, then the
 * grant index, then the publication index.
 */
const primaryBreakdown = ({ range, scope, bySection, yearClause, missedMonetization, assetList }) => {
  const rangeExpr = cpcRangeExpression(range);
  const scoped = scopeClause({ scope, rangeExpr, bySection });
  const cte = assetListCte(assetList);

  if (missedMonetization) {
    /*
     * These are assets we hold but never granted, so only the application-side
     * classification exists.
     *
     * Two aliases, not one: the old pair of membership tests covered
     * application_cpc.application_number and ag.appno_doc_num separately, and
     * because ag is joined on grant_doc_num those are not the same value. One
     * shared alias would silently add `ag.appno_doc_num = application_number`.
     */
    return `${cte}SELECT ${AGGREGATE_PROJECTION} FROM (
        SELECT application_cpc.grant_doc_num AS patent_number,
               application_cpc.application_number,
               date_format(ag.appno_date, '%Y') AS fillingYear,
               ${rangeExpr} AS cpc_code, section, class, sub_class, main_group, sub_group,
               ${INVENTOR_ORIGIN('db_patent_application_bibliographic.inventor',
    'db_patent_application_bibliographic.assignor_and_assignee')}
          FROM asset_list AS cpc_asset
          INNER JOIN db_patent_application_bibliographic.patent_cpc AS application_cpc
                  ON application_cpc.application_number = cpc_asset.appno
          INNER JOIN db_patent_application_bibliographic.application_grant AS ag
                  ON ag.grant_doc_num = application_cpc.grant_doc_num
          INNER JOIN asset_list AS grant_asset
                  ON grant_asset.appno_utf8 = ag.appno_doc_num
         WHERE application_cpc.type = 0
         ${scoped}) AS temp1 ${GROUPING} ORDER BY cpc_code DESC`;
  }

  /*
   * Each branch below joins asset_list once. The old query tested membership
   * twice per branch, but the branch's own join already equates the two
   * columns, so both tests were on the same value - one alias is exact.
   */
  return `${cte}SELECT ${AGGREGATE_PROJECTION} FROM (SELECT temp3.* FROM (
      SELECT temp.grant_doc_num AS patent_number, temp.appno_doc_num AS application_number,
             date_format(temp.appno_date, '%Y') AS fillingYear,
             ${rangeExpr} AS cpc_code, section, class, sub_class, main_group, sub_group,
             ${EMPLOYER_ORIGIN}
        FROM db_patent_application_bibliographic.patent_cpc AS application_cpc
        INNER JOIN (SELECT documentid.appno_doc_num, documentid.grant_doc_num, documentid.appno_date
                      FROM asset_list AS cpc_asset
                      INNER JOIN db_uspto.documentid AS documentid
                              ON documentid.appno_doc_num = cpc_asset.appno
                     WHERE date_format(documentid.appno_date, '%Y') ${yearClause}
                       AND documentid.grant_doc_num <> ''
                     GROUP BY documentid.appno_doc_num) AS temp
                ON temp.appno_doc_num = application_cpc.application_number
       WHERE application_cpc.type = 0 ${scoped}
       GROUP BY temp.appno_doc_num
      UNION
      SELECT application_grant.grant_doc_num, application_grant.appno_doc_num,
             date_format(application_grant.appno_date, '%Y'),
             ${rangeExpr}, section, class, sub_class, main_group, sub_group, '' AS origin
        FROM asset_list AS grant_asset
        INNER JOIN db_patent_application_bibliographic.patent_cpc AS application_cpc
                ON application_cpc.application_number = grant_asset.appno
        INNER JOIN db_patent_application_bibliographic.application_grant AS application_grant
                ON application_grant.appno_doc_num = grant_asset.appno_utf8
       WHERE date_format(application_grant.appno_date, '%Y') ${yearClause}
         AND application_grant.grant_doc_num <> ''
         AND application_cpc.type = 0 ${scoped}
       GROUP BY application_grant.appno_doc_num
      UNION
      SELECT '' AS patent_number, application_publication.appno_doc_num,
             date_format(application_publication.appno_date, '%Y'),
             ${rangeExpr}, section, class, sub_class, main_group, sub_group, '' AS origin
        FROM asset_list AS publication_asset
        INNER JOIN db_patent_grant_bibliographic.application_cpc AS application_cpc
                ON application_cpc.application_number = publication_asset.appno
        INNER JOIN db_patent_grant_bibliographic.application_publication AS application_publication
                ON application_publication.appno_doc_num = publication_asset.appno_utf8
       WHERE date_format(application_publication.appno_date, '%Y') ${yearClause}
         AND application_cpc.type = 0 ${scoped}
       GROUP BY application_publication.appno_doc_num) AS temp3
    GROUP BY temp3.application_number) AS temp1 ${GROUPING} ORDER BY cpc_code DESC`;
};

/**
 * The second pass, over assets the first pass did not classify — their
 * classification lives only in the publication index.
 */
const fallbackBreakdown = ({ range, scope, bySection, yearClause, missedMonetization, assetList }) => {
  const rangeExpr = cpcRangeExpression(range);
  const scoped = scopeClause({ scope, rangeExpr, bySection });
  const cte = assetListCte(assetList);

  if (missedMonetization) {
    return `${cte}SELECT ${AGGREGATE_PROJECTION} FROM (
        SELECT '' AS patent_number, application_cpc.application_number,
               date_format(ap.appno_date, '%Y') AS fillingYear,
               ${rangeExpr} AS cpc_code, section, class, sub_class, main_group, sub_group,
               ${INVENTOR_ORIGIN('db_patent_grant_bibliographic.inventor_new',
    'db_patent_application_bibliographic.assignor_and_assignee')}
          FROM asset_list AS cpc_asset
          INNER JOIN db_patent_grant_bibliographic.application_cpc AS application_cpc
                  ON application_cpc.application_number = cpc_asset.appno
          INNER JOIN db_patent_grant_bibliographic.application_publication AS ap
                  ON ap.appno_doc_num = application_cpc.application_number
         WHERE application_cpc.type = 0
         ${scoped}) AS temp1 ${GROUPING} ORDER BY cpc_code DESC`;
  }

  return `${cte}SELECT ${AGGREGATE_PROJECTION} FROM (
      SELECT temp.grant_doc_num AS patent_number, temp.appno_doc_num AS application_number,
             date_format(temp.appno_date, '%Y') AS fillingYear,
             ${rangeExpr} AS cpc_code, section, class, sub_class, main_group, sub_group,
             ${EMPLOYER_ORIGIN}
        FROM db_patent_grant_bibliographic.application_cpc AS application_cpc
        INNER JOIN (SELECT documentid.appno_doc_num, documentid.grant_doc_num, documentid.appno_date
                      FROM asset_list AS cpc_asset
                      INNER JOIN db_uspto.documentid AS documentid
                              ON documentid.appno_doc_num = cpc_asset.appno
                     WHERE date_format(documentid.appno_date, '%Y') ${yearClause}
                     GROUP BY documentid.appno_doc_num) AS temp
                ON temp.appno_doc_num = application_cpc.application_number
       WHERE application_cpc.type = 0 ${scoped}
       GROUP BY temp.appno_doc_num) AS temp1 ${GROUPING} ORDER BY cpc_code DESC`;
};

/** The assets inside one (year, CPC code) cell of the breakdown. */
const assetsInCpcCell = (range, assetList) => {
  const rangeExpr = cpcRangeExpression(range);
  // One alias per UNION branch: a CTE may be referenced many times, but each
  // reference needs its own name.
  const source = (cpcTable, grantPredicate, alias) => `SELECT temp.grant_doc_num, temp.appno_doc_num,
        temp.title, ${rangeExpr} AS cpc_code
     FROM ${cpcTable} AS application_cpc
     INNER JOIN (SELECT documentid.grant_doc_num, documentid.appno_doc_num,
                        documentid.appno_date, documentid.title
                   FROM asset_list AS ${alias}
                   INNER JOIN db_uspto.documentid AS documentid
                           ON documentid.appno_doc_num = ${alias}.appno
                  WHERE date_format(appno_date, '%Y') = :year
                    AND documentid.grant_doc_num ${grantPredicate}
                  GROUP BY documentid.appno_doc_num) AS temp
             ON temp.appno_doc_num = application_cpc.application_number
    WHERE application_cpc.type = 0 AND ${rangeExpr} = :cpcCode
    GROUP BY temp.appno_doc_num`;

  return `${assetListCte(assetList)}SELECT ROW_NUMBER() OVER () AS id,
      CASE WHEN grant_doc_num != '' THEN grant_doc_num ELSE appno_doc_num END AS asset,
      CASE WHEN grant_doc_num = '' THEN 1 ELSE 0 END AS asset_type,
      grant_doc_num, appno_doc_num, title, temp1.cpc_code AS cpc_code,
      (SELECT title FROM db_patent_grant_bibliographic.cpc_defination AS cpc_defination
        WHERE cpc_defination.cpc_code = temp1.cpc_code) AS defination
    FROM (${source('db_patent_application_bibliographic.patent_cpc', "<> ''", 'granted_asset')}
          UNION
          ${source('db_patent_grant_bibliographic.application_cpc', "= ''", 'pending_asset')}) AS temp1
    GROUP BY appno_doc_num`;
};

module.exports = {
  primaryBreakdown, fallbackBreakdown, assetsInCpcCell, scopeClause, assetListCte,
};
