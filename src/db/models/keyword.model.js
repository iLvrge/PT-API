'use strict';

const { DataTypes } = require('sequelize');
const { connections } = require('../index');

// Lives in the resources database (db_uspto). Write side only.
const Keyword = connections.resources.define(
  'keyword',
  {
    keyword_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    keyword_name: { type: DataTypes.STRING, allowNull: false },
  },
  { tableName: 'keyword', freezeTableName: true, underscored: true, timestamps: false }
);

module.exports = Keyword;
