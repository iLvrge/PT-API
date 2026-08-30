'use strict';

const { DataTypes } = require('sequelize');
const { connections } = require('../index');

const ActivityLog = connections.resources.define(
  'activity_log',
  {
    activity_log_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    organisation_id: { type: DataTypes.INTEGER, allowNull: true },
    user_id: { type: DataTypes.INTEGER, allowNull: true },
    type: { type: DataTypes.INTEGER, allowNull: true },
    company_name: { type: DataTypes.STRING, allowNull: true },
    representative_company_name: { type: DataTypes.STRING, allowNull: true },
    activity_date: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: 'activity_log', freezeTableName: true, underscored: true, timestamps: false }
);

module.exports = ActivityLog;
