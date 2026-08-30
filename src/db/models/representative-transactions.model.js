'use strict';

const { DataTypes } = require('sequelize');
const { connections } = require('../index');

const RepresentativeTransactions = connections.resources.define(
  'representative_transactions',
  {
    representative_transaction_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    representative_id: { type: DataTypes.INTEGER, allowNull: true },
    organisation_id: { type: DataTypes.INTEGER, allowNull: true },
    rf_id: { type: DataTypes.INTEGER, allowNull: true },
  },
  { tableName: 'representative_transactions', freezeTableName: true, underscored: true, timestamps: false }
);

module.exports = RepresentativeTransactions;
