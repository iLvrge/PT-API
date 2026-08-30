'use strict';

/**
 * Assets: the portfolio's underlying patents and applications, their CPC
 * classification breakdown, and moving them between layouts.
 */

const { env } = require('../../config/env');
const ApiError = require('../../utils/api-error');
const { findLayout, checkTabs } = require('../../shared/layouts');
const { illustrationJson } = require('../../utils/background-job');
const repository = require('./assets.repository');
const {
  CPC_YEAR_FLOOR, ASSETS_LAYOUT_CEILING, normaliseAssetNumber,
} = require('./assets.constants');

const yearFloor = () => new Date().getFullYear() - 24;

const TOP_LAW_FIRMS = 'top_law_firms';
const DUE_DILIGENCE = 'due_dilligence';
const MISSED_MONETIZATION = 'missed_monetization';

const list = (orgId) => repository.listForOrganisation(orgId);

const grantYears = async (list_) => {
  if (!list_.length) return { list: [] };
  return { list: await repository.grantYears(list_) };
};

/* --------------------------------------------------- resolving the assets */

/**
 * Work out which assets a CPC request covers.
 *
 * The caller can hand over a complete list; otherwise it is derived from the
 * layout. `top_law_firms` is special: the assets are the ones filed by the
 * firms that metric names, which needs two hops.
 */
const resolveAssets = async ({ list: supplied, total, type, companies, assignments, customers, bankMode }) => {
  // A list that matches its own declared total is taken at face value.
  if (supplied.length && supplied.length === total) return supplied;
  if (!type || type === DUE_DILIGENCE) return supplied;

  if (type === TOP_LAW_FIRMS) {
    const applications = (await repository.applicationsForMetric({
      companies, type: findLayout(type), assignments: [], customers: [], bankMode,
    })).map((row) => `${row.application}`);
    if (!applications.length) return [];

    const names = (await repository.lawFirmNames({ companies, assignments }))
      .map((row) => `${row.lawfirm}`);
    if (!names.length) return [];

    const rows = await repository.applicationsByLawFirm({ applications, lawFirmNames: names });
    return rows.map((row) => `${row.appno_doc_num}`);
  }

  // Metric 38 (top non-US family members) is computed over the owned assets.
  let metric = findLayout(type);
  if (metric === 38) metric = 30;

  const rows = await repository.applicationsForMetric({
    companies, type: metric, assignments, customers, bankMode,
  });
  return rows.map((row) => `${row.application}`);
};

/** Fall back to the raw asset table when the metric produced nothing. */
const assetsFromSelection = async ({ type, companies, tabs, customers, assignments, otherMode, orgId }) => {
  if (otherMode) {
    const rows = await repository.assetsForSale({ orgId });
    return rows.map((row) => `${row.appno_doc_num}`);
  }

  const layoutId = type ? Math.min(findLayout(type), ASSETS_LAYOUT_CEILING) : ASSETS_LAYOUT_CEILING;
  const rows = await repository.selectionAssets({
    companies,
    tabs: checkTabs(tabs),
    customers,
    assignments,
    layoutId,
    year: CPC_YEAR_FLOOR,
    // The law-firm view deliberately keeps employee assignments in scope.
    excludeEmployees: type !== TOP_LAW_FIRMS,
  });
  return rows.map((row) => `${row.appno_doc_num}`);
};

/* -------------------------------------------------------------------- CPC */

/**
 * POST /assets/cpc — the classification breakdown.
 *
 * Runs in two passes: the first covers assets classified in the grant indexes,
 * the second picks up whatever it missed from the publication index. The two
 * are concatenated and the CPC definitions attached.
 */
const cpcBreakdown = async (input) => {
  const {
    range, scope, years, dataType, otherMode, orgId, type,
  } = input;

  let assets = await resolveAssets(input);
  if (!assets.length) {
    assets = await assetsFromSelection({ ...input, otherMode, orgId });
  }
  if (!assets.length) return { list: [], group: [], sales: [] };

  const sales = otherMode
    ? [...assets]
    : (await repository.assetsForSale({ orgId, list: assets })).map((r) => `${r.appno_doc_num}`);

  const yearClause = years.length ? 'IN (:date)' : '>= :date';
  const common = {
    scope,
    range,
    // Scoping by section only applies when the caller already had a list.
    bySection: dataType === 1,
    yearClause,
    years: years.length ? years : CPC_YEAR_FLOOR,
    missedMonetization: type === MISSED_MONETIZATION,
  };

  const primary = await repository.cpcBreakdown({ ...common, list: assets, fallback: false });

  // Anything the first pass did not classify gets a second look.
  const classified = new Set();
  primary.forEach((row) => {
    if (row.appNum) String(row.appNum).split(',').forEach((n) => classified.add(n));
  });
  const remaining = assets.filter((asset) => !classified.has(asset));

  const fallback = remaining.length
    ? await repository.cpcBreakdown({ ...common, list: remaining, fallback: true })
    : [];

  const rows = [...primary, ...fallback].sort((a, b) =>
    String(a.cpc_code).localeCompare(String(b.cpc_code)));

  // One group entry per distinct CPC code, in first-seen order.
  const group = [];
  const seen = new Set();
  rows.forEach((row) => {
    if (seen.has(row.cpc_code)) return;
    seen.add(row.cpc_code);
    group.push({
      id: group.length + 1,
      cpc_code: row.cpc_code,
      section: row.section,
      class: row.class,
      sub_class: row.sub_class,
      main_group: row.main_group,
      sub_group: row.sub_group,
      defination: '',
    });
  });

  if (group.length) {
    const definitions = await repository.cpcDefinitions([...seen]);
    const byCode = new Map(definitions.map((d) => [d.cpc_code, d.defination]));
    group.forEach((entry) => {
      if (byCode.has(entry.cpc_code)) entry.defination = byCode.get(entry.cpc_code);
    });
  }

  return { list: rows, group, sales };
};

/** POST /assets/cpc/:year/:cpcCode — the assets inside one breakdown cell. */
const cpcCellAssets = async (input) => {
  const { year, cpcCode, range, type } = input;
  if (type === DUE_DILIGENCE) return { list: [] };

  let assets = await resolveAssets(input);
  if (!assets.length) assets = await assetsFromSelection(input);
  if (!assets.length) return { list: [] };

  return { list: await repository.assetsInCpcCell({ list: assets, year, cpcCode, range }) };
};

/* ------------------------------------------------------------ single asset */

/** GET /assets/:asset — the illustration for one asset. */
const illustration = async ({ asset, flag, orgId, userId }) => {
  let found = await repository.findAsset({ asset, flag });
  if (!found.length && flag !== undefined) {
    found = await repository.findAssetInBiblio({ asset, isGrant: Number(flag) === 1 });
  }
  if (!found.length) throw ApiError.badRequest('Invalid number');
  return illustrationJson({ asset, flag: flag === undefined ? '' : flag, orgId, userId });
};

/** GET /assets/:patentNumber/:type/outsource — a link into Assignment Center. */
const outsourceUrl = async ({ patentNumber, type, flag }) => {
  const base = env.external.assignmentCenterUrl;
  if (!base) throw ApiError.internal('The Assignment Center URL is not configured');

  if (Number(type) === 1) {
    const found = await repository.findAsset({ asset: patentNumber, flag });
    const inBiblio = found.length
      ? found
      : await repository.findAssetInBiblio({ asset: patentNumber, isGrant: Number(flag) !== 0 });
    if (!inBiblio.length) return null;
    const queryType = Number(flag) === 0 ? 'applicationNumber' : 'patentNumber';
    return `${base}abstract%3F${queryType}%3D${encodeURIComponent(patentNumber)}`;
  }

  const assignment = await repository.reelFrame(patentNumber);
  if (!assignment) return null;
  const frame = String(assignment.frame_no).padStart(4, '0');
  return `${base}reelFrameDetail%3FreelFrame%3D${assignment.reel_no}-${frame}`;
};

/** GET /assets/download/:itemID — where the recorded assignment PDF lives. */
const downloadLink = async (rfId) => {
  const assignment = await repository.reelFrame(rfId);
  if (!assignment) throw ApiError.notFound('No such transaction');
  const name = `assignment-pat-${assignment.reel_no}-${assignment.frame_no}.pdf`;
  // status 1 means we mirrored the document; otherwise it is linked at the USPTO.
  return Number(assignment.status) === 1
    ? `${env.assets.cdnUrl}${name}`
    : `${env.assets.usptoAssignmentsUrl}${name}`;
};

/* ---------------------------------------------------------------- writes */

/**
 * POST /assets/move — move assets between layouts.
 *
 * Moving to a new layout writes two rows: the asset arriving in the new layout
 * (status 1) and leaving the old one (status 0). Category 0 means "stay put",
 * which writes only the one row.
 */
const move = async ({ movedAssets, orgId }) => {
  if (!movedAssets.length) return [];

  const rows = [];
  movedAssets.forEach((item) => {
    const moving = Number(item.move_category) !== 0;
    rows.push({
      grant_doc_num: item.grant_doc_num,
      appno_doc_num: item.appno_doc_num,
      organisation_id: orgId,
      layout_id: moving ? item.move_category : item.currentLayout,
      status: moving ? 1 : 0,
    });
    if (moving) {
      rows.push({
        grant_doc_num: item.grant_doc_num,
        appno_doc_num: item.appno_doc_num,
        organisation_id: orgId,
        layout_id: item.currentLayout,
        status: 0,
      });
    }
  });

  await repository.moveAssets(rows);
  return repository.findMovedAssets(rows);
};

/** DELETE /assets/rollback — undo a move. */
const rollback = async (assetIds) => {
  if (!assetIds.length) return false;
  const removed = await repository.rollbackAssets(assetIds);
  return removed > 0;
};

/** POST /assets/validate — which of these numbers we do not recognise. */
const validate = async (assets) => {
  if (!assets.length) return [];
  const normalised = assets.map(normaliseAssetNumber);
  const known = await repository.knownAssetNumbers(normalised.filter(Boolean));
  // Report back the number the caller sent, not our normalised form.
  return assets.filter((_original, i) => !known.has(normalised[i]));
};

/** POST /assets/assets_for_sale — list an asset for sale. */
const listForSale = async ({ appnoDocNum, grantDocNum, type, orgId }) => {
  if (!appnoDocNum && !grantDocNum) throw ApiError.badRequest('Invalid inputs');
  await repository.listForSale([{
    appno_doc_num: appnoDocNum,
    grant_doc_num: grantDocNum,
    type,
    organisation_id: orgId,
  }]);
  return { message: 'Assets moved for sale successfully' };
};

module.exports = {
  list,
  grantYears,
  cpcBreakdown,
  cpcCellAssets,
  illustration,
  outsourceUrl,
  downloadLink,
  move,
  rollback,
  validate,
  listForSale,
  resolveAssets,
  assetsFromSelection,
  yearFloor,
};
