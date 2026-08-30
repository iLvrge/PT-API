'use strict';

/**
 * Public share links: creating them, and serving the read-only views they
 * unlock. Every read here is reached without a token, so a code is the only
 * credential — see share-codes.js for how codes are generated.
 */

const { env } = require('../../config/env');
const ApiError = require('../../utils/api-error');
const { illustrationJson } = require('../../utils/background-job');
const shareCodes = require('../../shared/share-codes');
const repository = require('./share.repository');

// Share type -> the host the link is served from.
const SUBDOMAINS = { 0: 'standard.app', 2: 'sample.app' };
const DEFAULT_SUBDOMAIN = 'share';

// share_list.type: 4 = granted patent, 5 = pending application.
const GRANT = 4;
const APPLICATION = 5;

const linkFor = (type, code) =>
  `https://${SUBDOMAINS[type] || DEFAULT_SUBDOMAIN}.${env.share.domain}/${code}`;

/** Split share_list rows into patent numbers and application numbers. */
const splitAssets = (rows) => {
  const grants = [];
  const applications = [];
  rows.forEach((row) => {
    if (Number(row.type) === GRANT) grants.push(row.asset);
    else applications.push(row.asset);
  });
  return { grants, applications };
};

/**
 * Create a share link over an explicit asset list, or over the assets covered
 * by a transaction list.
 */
const create = async ({ orgId, userId, type, assets, transactions }) => {
  if (!assets.length && !transactions.length) {
    throw ApiError.badRequest('A share link needs either assets or transactions');
  }

  const code = await shareCodes.allocate();
  if (!code) throw ApiError.internal('Unable to allocate a share code');

  const share = await repository.createShare({
    code, organisation_id: orgId, user_id: userId, type,
  });
  if (!share || !(share.share_id > 0)) throw ApiError.internal('Unable to create share url');

  let rows = assets.map((item) => ({ asset: item.asset, type: item.flag, share_id: share.share_id }));

  if (!rows.length) {
    const covered = await repository.assetsForTransactions(transactions);
    if (covered.length) {
      await repository.setTransactions(share.share_id, JSON.stringify(transactions));
      rows = covered.map((item) => ({ asset: item.asset, type: item.flag, share_id: share.share_id }));
    }
  }

  if (!rows.length) throw ApiError.badRequest('No assets found for this selection');
  await repository.addAssets(rows);
  return linkFor(type, code);
};

/** Re-share a single asset out of an existing link, as its own link. */
const shareOneAsset = async ({ code, asset }) => {
  const source = await repository.byCode(code);
  if (!source) throw ApiError.notFound('Unknown share code');
  return create({
    orgId: source.organisation_id,
    userId: source.user_id,
    type: source.type,
    assets: [{ asset, flag: APPLICATION }],
    transactions: [],
  });
};

/** The asset list behind a share link, for the public viewer. */
const assets = async (code, type) => {
  if (Number(type) === 9) {
    const row = await repository.dashboardSelection(code);
    if (!row) throw ApiError.notFound('Invalid url');
    return { list: row, total_records: 0, logo: await repository.organisationLogo(code) };
  }

  const rows = await repository.assetRows(code, type);
  if (!rows.length) throw ApiError.notFound('Invalid url');

  const { grants, applications } = splitAssets(rows);
  const list = grants.length || applications.length
    ? await repository.resolveAssets({ grants, applications })
    : [];

  return { list, total_records: list.length, logo: await repository.organisationLogo(code) };
};

/** The illustration JSON for one asset on a share link. */
const assetIllustration = async ({ code, asset }) => {
  const share = await repository.coversAsset(code, asset);
  if (!share) throw ApiError.notFound('Invalid url');
  return illustrationJson({ asset, orgId: share.organisation_id, userId: share.user_id });
};

/** The illustration JSON for the first asset on a share link. */
const firstIllustration = async (code) => {
  const rows = await repository.assetRows(code, 1);
  if (!rows.length) throw ApiError.notFound('Invalid url');

  const first = rows[0];
  const share = await repository.coversAsset(code, first.asset);
  if (!share) throw ApiError.notFound('Invalid url');

  return illustrationJson({
    asset: first.asset,
    // asset_type 0 (a granted patent) is requested with flag 1.
    flag: Number(first.type) === GRANT ? 1 : 0,
    orgId: share.organisation_id,
    userId: share.user_id,
  });
};

/** The transaction timeline behind a share link. */
const timeline = async (code) => {
  const share = await repository.byCodeWithAssets(code);
  if (!share) throw ApiError.badRequest('Invalid code');

  let rfIds = [];
  if (share.transactions) {
    try {
      rfIds = JSON.parse(share.transactions) || [];
    } catch (_err) {
      rfIds = [];
    }
  }

  // Older links stored only the assets; derive their transactions on read.
  if (!rfIds.length && share.share_lists.length) {
    rfIds = await repository.transactionsForAssets(splitAssets(share.share_lists));
  }

  const list = rfIds.length ? await repository.timeline(share.organisation_id, rfIds) : [];
  return { list, groups: [] };
};

/** The dashboard selection behind a type-9 share link. */
const dashboard = async (code) => {
  const row = await repository.dashboardSelection(code);
  if (!row) throw ApiError.badRequest('Invalid code');

  let selection = {};
  try {
    selection = JSON.parse(row.transactions) || {};
  } catch (_err) {
    selection = {};
  }
  return { ...selection, share_button: row.share_button };
};

module.exports = {
  create,
  shareOneAsset,
  assets,
  assetIllustration,
  firstIllustration,
  timeline,
  dashboard,
  linkFor,
  splitAssets,
  GRANT,
  APPLICATION,
};
