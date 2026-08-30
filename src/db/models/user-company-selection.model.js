'use strict';

const { DataTypes } = require('sequelize');
const { connections } = require('../index');

const UserCompanySelection = connections.business.define(
  'user_company_selection',
  {
    user_company_selection_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    organisation_id: { type: DataTypes.INTEGER, allowNull: false },
    representative_id: { type: DataTypes.INTEGER, allowNull: false },
  },
  { tableName: 'user_company_selection', freezeTableName: true, underscored: true, timestamps: false }
);

module.exports = UserCompanySelection;
