'use strict';

const { DataTypes } = require('sequelize');
const { connections } = require('../index');

const Share = connections.applicationNew.define(
  'share',
  {
    share_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    code: { type: DataTypes.STRING, allowNull: true },
    organisation_id: { type: DataTypes.INTEGER, allowNull: true },
    user_id: { type: DataTypes.INTEGER, allowNull: true },
    type: { type: DataTypes.INTEGER, allowNull: true },
    share_button: { type: DataTypes.STRING, allowNull: true },
    transactions: { type: DataTypes.TEXT, allowNull: true },
    show_other_companies: { type: DataTypes.INTEGER, allowNull: true },
  },
  { tableName: 'share', freezeTableName: true, underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' }
);

module.exports = Share;
