'use strict';

const { connections } = require('../../db');
const q = require('../../db/query');
const Share = require('../../db/models/share.model');
const ShareList = require('../../db/models/share-list.model');

const app = () => connections.applicationNew;

/* ------------------------------------------------------------------ reads */

const byCode = (code) =>
  q.selectOne(
    app(),
    `SELECT share_id, code, organisation_id, user_id, type, share_button, transactions,
            show_other_companies
       FROM share WHERE code = :code LIMIT 1`,
    { code }
  );

/** A share row plus the assets it covers. */
const byCodeWithAssets = async (code) => {
  const share = await byCode(code);
  if (!share) return null;
  const assets = await q.selectAll(
    app(),
    `SELECT asset, type FROM share_list WHERE share_id = :shareId`,
    { shareId: share.share_id }
  );
  return { ...share, share_lists: assets };
};

/** True when this share link covers the given asset. */
const coversAsset = async (code, asset) => {
  const share = await byCode(code);
  if (!share) return null;
  const covered = await q.exists(
    app(),
    `SELECT 1 FROM share_list WHERE share_id = :shareId AND asset = :asset`,
    { shareId: share.share_id, asset }
  );
  return covered ? share : null;
};

/** The dashboard selection stored behind a type-9 (dashboard) share link. */
const dashboardSelection = (code) =>
  q.selectOne(
    app(),
    `SELECT transactions, share_button, show_other_companies
       FROM share WHERE code = :code AND type = :type LIMIT 1`,
    { code, type: 9 }
  );

/** The asset rows on a share link, with the owning organisation. */
const assetRows = (code, type) =>
  q.selectAll(
    app(),
    `SELECT sl.asset AS asset, sl.type, s.organisation_id, s.show_other_companies
       FROM share AS s
       INNER JOIN share_list AS sl ON s.share_id = sl.share_id
      WHERE s.code = :code AND s.type = :type`,
    { code, type }
  );

/**
 * Resolve shared patent / application numbers to the full asset records the
 * viewer needs. Three sources are unioned because a number may only exist in
 * the recorded-assignment corpus, the granted-patent index, or the
 * publication index.
 */
const resolveAssets = ({ grants, applications }) => {
  const repl = {};
  if (grants.length) repl.grants = grants;
  if (applications.length) repl.applications = applications;

  const predicates = [];
  if (grants.length) predicates.push('grant_doc_num IN (:grants)');
  if (applications.length) predicates.push('appno_doc_num IN (:applications)');

  let sql = `SELECT appno_doc_num, grant_doc_num,
             CASE WHEN grant_doc_num = '' THEN appno_doc_num ELSE grant_doc_num END AS asset,
             CASE WHEN grant_doc_num = '' THEN 1 ELSE 0 END AS asset_type,
             '' AS channel, 0 AS child_count
        FROM db_uspto.documentid
       WHERE (${predicates.join(' OR ')}) GROUP BY appno_doc_num`;

  if (grants.length) {
    sql += ` UNION SELECT appno_doc_num, grant_doc_num, grant_doc_num AS asset, 0 AS asset_type,
             '' AS channel, 0 AS child_count
        FROM db_patent_application_bibliographic.application_grant
       WHERE grant_doc_num IN (:grants) GROUP BY appno_doc_num`;
  }
  if (applications.length) {
    sql += ` UNION SELECT appno_doc_num, '' AS grant_doc_num, appno_doc_num AS asset, 1 AS asset_type,
             '' AS channel, 0 AS child_count
        FROM db_patent_grant_bibliographic.application_publication
       WHERE appno_doc_num IN (:applications) GROUP BY appno_doc_num`;
  }
  return q.selectAll(app(), sql, repl);
};

/** The logo of the organisation that owns a share link. */
const organisationLogo = (code) =>
  q.selectValue(
    app(),
    `SELECT logo FROM db_business.organisation
      WHERE organisation_id IN (SELECT organisation_id FROM db_new_application.share WHERE code = :code)
      LIMIT 1`,
    { code },
    'logo',
    ''
  );

/** Transactions that cover any of the shared assets. */
const transactionsForAssets = async ({ grants, applications }) => {
  const predicates = [];
  const repl = {};
  if (grants.length) {
    predicates.push('grant_doc_num IN (:grants)');
    repl.grants = grants;
  }
  if (applications.length) {
    predicates.push('appno_doc_num IN (:applications)');
    repl.applications = applications;
  }
  if (!predicates.length) return [];
  const rows = await q.selectAll(
    connections.resources,
    `SELECT rf_id FROM documentid WHERE ${predicates.join(' OR ')} GROUP BY rf_id`,
    repl
  );
  return rows.map((row) => row.rf_id);
};

/** The shared timeline: one row per transaction, grouped into activity bands. */
const timeline = (organisationId, rfIds) =>
  q.selectAll(
    app(),
    `SELECT activity_parties_transactions.rf_id as id, exec_dt,
            assignor_and_assignee.name AS customerName, activity_id AS tab_id,
            (CASE WHEN activity_id IN (8, 9, 14) THEN 1
                  WHEN activity_id IN (5, 11, 12, 13) THEN 2
                  WHEN activity_id IN (3, 4) THEN 3
                  WHEN activity_id IN (1, 2, 6, 7) THEN 4
                  WHEN activity_id = 10 THEN 5 END) AS \`group\`,
            company_id AS \`company\`, COUNT(doc.appno_doc_num) AS totalAssets
       FROM activity_parties_transactions
       INNER JOIN db_uspto.documentid AS doc ON doc.rf_id = activity_parties_transactions.rf_id
       INNER JOIN db_uspto.assignor_and_assignee AS assignor_and_assignee
               ON assignor_and_assignee.assignor_and_assignee_id
                = activity_parties_transactions.assignor_and_assignee_id
      WHERE activity_parties_transactions.organisation_id = :organisationId
        AND activity_parties_transactions.rf_id IN (:rfIds)
      GROUP BY activity_parties_transactions.rf_id ORDER BY exec_dt DESC`,
    { organisationId, rfIds }
  );

/** Assets to attach to a share link built from a transaction list. */
const assetsForTransactions = (rfIds) =>
  q.selectAll(
    app(),
    `SELECT CASE WHEN patent = '' THEN application ELSE patent END AS asset,
            CASE WHEN patent = '' THEN 5 ELSE 4 END AS flag
       FROM (SELECT doc.appno_doc_num AS application, MAX(doc.grant_doc_num) AS patent
               FROM assets
               INNER JOIN db_uspto.documentid AS doc
                       ON CONVERT(assets.appno_doc_num USING latin1) = doc.appno_doc_num
              WHERE doc.rf_id IN (:rfIds)
              GROUP BY doc.rf_id, assets.appno_doc_num) AS temp`,
    { rfIds }
  );

/* ----------------------------------------------------------------- writes */

const createShare = (data) => Share.create(data);
const setTransactions = (shareId, transactions) =>
  Share.update({ transactions }, { where: { share_id: shareId } });
const addAssets = (rows) => ShareList.bulkCreate(rows, { ignoreDuplicates: true });

module.exports = {
  byCode,
  byCodeWithAssets,
  coversAsset,
  dashboardSelection,
  assetRows,
  resolveAssets,
  organisationLogo,
  transactionsForAssets,
  timeline,
  assetsForTransactions,
  createShare,
  setTransactions,
  addAssets,
};
