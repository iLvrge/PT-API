'use strict';

const { DataTypes } = require('sequelize');
const { connections } = require('../../db');
const q = require('../../db/query');
const cpcSql = require('./assets.cpc.sql');
const { ASSETS_LAYOUT_CEILING } = require('./assets.constants');

const app = () => connections.applicationNew;

/* ----------------------------------------------------------- write models */

const AssetTransfer = connections.application.define(
  'assets_transfer',
  {
    asset_id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    grant_doc_num: { type: DataTypes.STRING, allowNull: true },
    appno_doc_num: { type: DataTypes.STRING, allowNull: true },
    organisation_id: { type: DataTypes.BIGINT, allowNull: false },
    layout_id: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.INTEGER, allowNull: false },
  },
  { tableName: 'assets_transfer', freezeTableName: true, underscored: true, timestamps: false }
);

const AssetForSale = connections.applicationNew.define(
  'assets_for_sale',
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    appno_doc_num: { type: DataTypes.STRING, allowNull: true },
    grant_doc_num: { type: DataTypes.STRING, allowNull: true },
    type: { type: DataTypes.INTEGER, allowNull: true },
    organisation_id: { type: DataTypes.BIGINT, allowNull: false },
  },
  { tableName: 'assets_for_sale', freezeTableName: true, underscored: true, timestamps: false }
);

/* ------------------------------------------------------------------ reads */

/** GET /assets — every tracked asset for the caller's organisation. */
const listForOrganisation = (orgId) =>
  q.selectAll(
    connections.applicationNew,
    `SELECT * FROM assets WHERE organisation_id = :orgId`,
    { orgId }
  );

/** Grant numbers with their filing year, from either grant index. */
const grantYears = (list) =>
  q.selectAll(
    connections.application,
    `SELECT * FROM (
        SELECT grant_doc_num, date_format(appno_date, '%Y') AS year
          FROM db_patent_application_bibliographic.application_grant
         WHERE grant_doc_num IN (:list) GROUP BY grant_doc_num
        UNION
        SELECT MAX(grant_doc_num) AS grant_doc_num, date_format(MAX(appno_date), '%Y') AS year
          FROM db_uspto.documentid WHERE grant_doc_num IN (:list) GROUP BY grant_doc_num
      ) AS temp GROUP BY grant_doc_num`,
    { list }
  );

/** The applications behind one dashboard metric. */
const applicationsForMetric = ({ companies, type, assignments, customers, bankMode }) => {
  const repl = { organisationId: 0, companies, type };
  if (bankMode) repl.mode = 1;
  let sql = `SELECT application FROM db_new_application.dashboard_items
      WHERE organisation_id = :organisationId AND representative_id IN (:companies)
      ${bankMode ? ' AND mode IN (:mode) ' : ''}`;

  if (assignments.length) {
    repl.assignments = assignments;
    if (type === 30) {
      // Metric 30 is "assigned": narrow to the assets on those transactions,
      // but keep the metric itself unfiltered.
      sql += ` AND application IN (SELECT application FROM db_new_application.dashboard_items
                 WHERE organisation_id = :organisationId AND representative_id IN (:companies)
                   AND rf_id IN (:assignments) ${bankMode ? ' AND mode IN (:mode) ' : ''})`;
    } else {
      sql += ` AND type = :type AND rf_id IN (:assignments)`;
    }
  } else {
    sql += ` AND type = :type`;
  }

  if (customers.length) {
    repl.customers = customers;
    sql += ` AND assignor_id IN (:customers)`;
  }

  return q.selectAll(connections.application, `${sql} GROUP BY application`, repl);
};

/** The law firms filing for a company, from the top-law-firms metric. */
const lawFirmNames = ({ companies, assignments }) => {
  const repl = { organisationId: 0, companies, type: 40 };
  let sql = `SELECT lawfirm FROM dashboard_items
      WHERE organisation_id = :organisationId AND representative_id IN (:companies) AND type = :type`;
  if (assignments.length) {
    sql += ` AND rf_id IN (:assignments)`;
    repl.assignments = assignments;
  }
  return q.selectAll(app(), `${sql} GROUP BY lawfirm`, repl);
};

/** Applications filed by any of the named law firms. */
const applicationsByLawFirm = ({ applications, lawFirmNames: names }) =>
  q.selectAll(
    app(),
    `SELECT l.appno_doc_num FROM db_patent_application_bibliographic.lawfirm AS l
      WHERE l.appno_doc_num IN (:applications)
        AND TRIM(BOTH '.' FROM l.name) IN (:names)
      GROUP BY l.appno_doc_num`,
    { applications, names }
  );

/** Assets in the selection, resolved from db_new_application.assets. */
const selectionAssets = ({ companies, tabs, customers, assignments, layoutId, year, excludeEmployees }) => {
  const repl = { year, organisationId: 0, layoutId };
  if (companies.length) repl.companies = companies;
  if (tabs.length) repl.tabs = tabs;
  if (customers.length) repl.customers = customers;
  if (assignments.length) repl.assignments = assignments;

  let sql = `SELECT appno_doc_num FROM db_new_application.assets AS assets
      WHERE date_format(assets.appno_date, '%Y') > :year AND assets.layout_id = :layoutId
        AND (assets.organisation_id = :organisationId OR assets.organisation_id IS NULL)`;
  if (companies.length) sql += ` AND assets.company_id IN (:companies)`;

  const hasFilter = assignments.length > 0 || tabs.length > 0 || customers.length > 0;
  if (hasFilter) {
    // assets.appno_doc_num is utf8mb4; db_uspto.documentid is latin1 and
    // indexed, so the utf8mb4 side is narrowed. See COLLATION.md.
    let inner = `SELECT CONVERT(documentid.appno_doc_num USING latin1) FROM db_uspto.documentid
        WHERE rf_id IN (SELECT activity_parties_transactions.rf_id
                          FROM db_new_application.activity_parties_transactions
                         WHERE (activity_parties_transactions.organisation_id = :organisationId
                                OR activity_parties_transactions.organisation_id IS NULL)`;
    if (companies.length) inner += ` AND activity_parties_transactions.company_id IN (:companies)`;
    if (assignments.length) inner += ` AND activity_parties_transactions.rf_id IN (:assignments)`;
    if (tabs.length) inner += ` AND activity_parties_transactions.activity_id IN (:tabs)`;
    else if (excludeEmployees) inner += ` AND activity_parties_transactions.activity_id <> 10`;
    if (customers.length) {
      inner += ` AND activity_parties_transactions.assignor_and_assignee_id IN (:customers)`;
    }
    inner += ` GROUP BY activity_parties_transactions.rf_id) GROUP BY documentid.appno_doc_num`;
    sql += ` AND CONVERT(assets.appno_doc_num USING latin1) IN (${inner})`;
  }

  return q.selectAll(app(), `${sql} GROUP BY appno_doc_num`, repl);
};

/** Assets the organisation has listed for sale. */
const assetsForSale = ({ orgId, list }) => {
  if (!list) {
    return q.selectAll(
      app(),
      `SELECT appno_doc_num FROM db_new_application.assets_for_sale AS assets
        WHERE assets.organisation_id = :orgId GROUP BY appno_doc_num`,
      { orgId }
    );
  }
  return q.selectAll(
    app(),
    `SELECT appno_doc_num FROM db_new_application.assets_for_sale AS assets
      WHERE appno_doc_num IN (:list) AND assets.organisation_id = :orgId GROUP BY appno_doc_num`,
    { orgId, list }
  );
};

/* -------------------------------------------------------------------- CPC */

const cpcBreakdown = ({ list, scope, range, bySection, yearClause, years, missedMonetization, fallback }) => {
  const repl = { list };
  if (scope.length) repl.scopeList = scope;
  repl.date = years;
  const build = fallback ? cpcSql.fallbackBreakdown : cpcSql.primaryBreakdown;
  return q.selectAll(app(), build({ range, scope, bySection, yearClause, missedMonetization }), repl);
};

const cpcDefinitions = (codes) =>
  q.selectAll(
    app(),
    `SELECT cpc_code, title AS defination FROM db_patent_grant_bibliographic.cpc_defination
      AS cpc_defination WHERE cpc_defination.cpc_code IN (:codes)`,
    { codes }
  );

const assetsInCpcCell = ({ list, year, cpcCode, range }) =>
  q.selectAll(app(), cpcSql.assetsInCpcCell(range), { list, year, cpcCode });

/* ------------------------------------------------------ single asset info */

/**
 * Whether an asset number is known, and its transaction ids.
 *
 * `documentid` lives in db_application, not db_new_application — the legacy
 * model this replaces was defined on that connection.
 */
const findAsset = ({ asset, flag }) => {
  let predicate = '(grant_doc_num = :asset OR appno_doc_num = :asset)';
  if (Number(flag) === 1) predicate = 'grant_doc_num = :asset';
  else if (Number(flag) === 0) predicate = 'appno_doc_num = :asset';
  return q.selectAll(
    connections.application,
    `SELECT rf_id, grant_doc_num AS number, appno_doc_num AS application
       FROM documentid WHERE ${predicate}`,
    { asset }
  );
};

/** The bibliographic fallback when the assignment corpus has no record. */
const findAssetInBiblio = ({ asset, isGrant }) =>
  q.selectAll(
    connections.resources,
    isGrant
      ? `SELECT appno_doc_num, appno_date, grant_doc_num, grant_date, 0 AS rf_id
           FROM db_patent_application_bibliographic.application_grant WHERE grant_doc_num = :asset`
      : `SELECT appno_doc_num, appno_date, '' AS grant_doc_num, '' AS grant_date, 0 AS rf_id
           FROM db_patent_grant_bibliographic.application_publication WHERE appno_doc_num = :asset`,
    { asset }
  );

/** The reel/frame of a recorded transaction, for building a USPTO link. */
const reelFrame = (rfId) =>
  q.selectOne(
    connections.resources,
    `SELECT reel_no, frame_no, status FROM assignment WHERE rf_id = :rfId LIMIT 1`,
    { rfId }
  );

/** Which of the given asset numbers exist in the corpus at all. */
const knownAssetNumbers = async (assets) => {
  const rows = await q.selectAll(
    connections.resources,
    `SELECT grant_doc_num, appno_doc_num FROM documentid
      WHERE appno_doc_num IN (:assets) OR grant_doc_num IN (:assets)
      GROUP BY grant_doc_num, appno_doc_num`,
    { assets }
  );
  const known = new Set();
  rows.forEach((row) => {
    if (row.grant_doc_num) known.add(row.grant_doc_num);
    if (row.appno_doc_num) known.add(row.appno_doc_num);
  });
  return known;
};

/* ----------------------------------------------------------------- writes */

const moveAssets = (rows) => AssetTransfer.bulkCreate(rows);

/** Find the rows a move just created, so the client can roll them back. */
const findMovedAssets = (rows) => {
  const clauses = [];
  const repl = {};
  rows.forEach((row, i) => {
    clauses.push(`(grant_doc_num = :grant${i} AND appno_doc_num = :appno${i}
                   AND layout_id = :layout${i} AND status = :status${i})`);
    repl[`grant${i}`] = row.grant_doc_num;
    repl[`appno${i}`] = row.appno_doc_num;
    repl[`layout${i}`] = row.layout_id;
    repl[`status${i}`] = row.status;
  });
  return q.selectAll(
    connections.application,
    `SELECT asset_id FROM assets_transfer WHERE ${clauses.join(' OR ')}`,
    repl
  );
};

const rollbackAssets = (assetIds) => AssetTransfer.destroy({ where: { asset_id: assetIds } });

const listForSale = (rows) => AssetForSale.bulkCreate(rows, { ignoreDuplicates: true });

module.exports = {
  listForOrganisation,
  grantYears,
  applicationsForMetric,
  lawFirmNames,
  applicationsByLawFirm,
  selectionAssets,
  assetsForSale,
  cpcBreakdown,
  cpcDefinitions,
  assetsInCpcCell,
  findAsset,
  findAssetInBiblio,
  reelFrame,
  knownAssetNumbers,
  moveAssets,
  findMovedAssets,
  rollbackAssets,
  listForSale,
  ASSETS_LAYOUT_CEILING,
};
