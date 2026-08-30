'use strict';

const { DataTypes } = require('sequelize');
const { connections } = require('../index');

const UserActivitySelection = connections.business.define(
  'user_activity_selection',
  {
    user_activity_selection_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    organisation_id: { type: DataTypes.INTEGER, allowNull: false },
    activity_id: { type: DataTypes.INTEGER, allowNull: false },
  },
  { tableName: 'user_activity_selection', freezeTableName: true, underscored: true, timestamps: false }
);

module.exports = UserActivitySelection;
