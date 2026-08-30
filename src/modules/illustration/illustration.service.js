'use strict';

const assignmentData = require('../../shared/assignment-data');
const repository = require('./illustration.repository');
const builder = require('./illustration.builder');

/** The illustration for one transaction id. */
const forRfId = async (rfId) => {
  const details = await assignmentData.byRfId(rfId);
  return builder.build(details, rfId);
};

/** The illustration for a "reel-frame" pair, e.g. 45231-0812. */
const forReelFrame = async (reelFrame) => {
  const parts = String(reelFrame).split('-');
  if (parts.length !== 2) return {};
  const rfId = await repository.rfIdForReelFrame(parts[0], parts[1]);
  if (!rfId) return {};
  return forRfId(rfId);
};

/** The illustration for the transaction that misnamed one application. */
const forApplication = async ({ applicationNumber, companies, bankMode }) => {
  if (!applicationNumber || !companies.length) return {};
  const rfId = await repository.rfIdForIncorrectName({ applicationNumber, companies, bankMode });
  if (!rfId) return {};
  return forRfId(rfId);
};

module.exports = { forRfId, forReelFrame, forApplication };
