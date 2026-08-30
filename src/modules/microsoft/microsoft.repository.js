'use strict';

const { DataTypes } = require('sequelize');
const { connections } = require('../../db');
const q = require('../../db/query');

const Organisation = connections.business.define(
  'organisation',
  {
    organisation_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: true },
    microsoft_team: { type: DataTypes.STRING, allowNull: true },
  },
  { tableName: 'organisation', freezeTableName: true, underscored: true, timestamps: false }
);

/** Which organisation, if any, already owns this Teams team. */
const organisationForTeam = (teamId) =>
  q.selectOne(
    connections.business,
    `SELECT organisation_id, name FROM organisation WHERE microsoft_team = :teamId LIMIT 1`,
    { teamId }
  );

/** Remember the team this organisation's channels live under. */
const setOrganisationTeam = (orgId, teamId) =>
  Organisation.update({ microsoft_team: teamId }, { where: { organisation_id: orgId } });

module.exports = { organisationForTeam, setOrganisationTeam };
