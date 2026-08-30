'use strict';

const { DataTypes } = require('sequelize');
const { connections } = require('../../db');
const q = require('../../db/query');
const { tenantModel } = require('../../db/tenant-models');

const Organisation = connections.business.define(
  'organisation',
  {
    organisation_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    team: { type: DataTypes.STRING, allowNull: true },
  },
  { tableName: 'organisation', freezeTableName: true, underscored: true, timestamps: false }
);

/** The organisation that installed the app into this Slack workspace. */
const organisationForTeam = (team) =>
  q.selectOne(
    connections.business,
    `SELECT organisation_id, name FROM organisation WHERE team = :team LIMIT 1`,
    { team }
  );

/** An active manager in an organisation, used to mint the session token. */
const managerFor = (orgId) =>
  q.selectOne(
    connections.business,
    `SELECT user_id, organisation_id FROM user
      WHERE organisation_id = :orgId AND type = '0' AND status = 0 LIMIT 1`,
    { orgId }
  );

const isManager = (userId) =>
  q.exists(connections.business, `SELECT 1 FROM user WHERE user_id = :userId AND type = '0'`, { userId });

const currentTeam = (orgId) =>
  q.selectValue(
    connections.business,
    `SELECT team FROM organisation WHERE organisation_id = :orgId LIMIT 1`,
    { orgId },
    'team',
    null
  );

const setTeam = (orgId, team) =>
  Organisation.update({ team }, { where: { organisation_id: orgId } });

/** The Slack channel tracking one asset, in the caller's tenant database. */
const channelForAsset = (tenant, asset) =>
  q.selectOne(
    tenant,
    `SELECT channel_id FROM assets_channel WHERE asset = :asset LIMIT 1`,
    { asset }
  );

/** Record the channel created for an asset. */
const rememberAssetChannel = (tenant, { asset, channelId }) =>
  tenantModel(tenant, 'assets_channel').create({ asset, channel_id: channelId });

/** An asset's title, used as the channel topic. */
const assetTitle = (asset) =>
  q.selectValue(
    connections.application,
    `SELECT title FROM documentid WHERE grant_doc_num = :asset OR appno_doc_num = :asset LIMIT 1`,
    { asset },
    'title',
    null
  );

module.exports = {
  organisationForTeam,
  managerFor,
  isManager,
  currentTeam,
  setTeam,
  channelForAsset,
  rememberAssetChannel,
  assetTitle,
};
