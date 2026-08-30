'use strict';

const { DataTypes } = require('sequelize');
const { connections } = require('../index');

const ClientAddCompany = connections.applicationNew.define(
  'client_add_company',
  {
    company_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
    organisation_id: { type: DataTypes.INTEGER, allowNull: true },
    representative_id: { type: DataTypes.INTEGER, allowNull: true },
    account_id: { type: DataTypes.INTEGER, allowNull: true },
    status: { type: DataTypes.INTEGER, allowNull: true },
    request_date: { type: DataTypes.DATEONLY, allowNull: true },
  },
  { tableName: 'client_add_company', freezeTableName: true, underscored: true, timestamps: false }
);

module.exports = ClientAddCompany;
