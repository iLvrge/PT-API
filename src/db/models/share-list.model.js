'use strict';

const { DataTypes } = require('sequelize');
const { connections } = require('../index');

/**
 * The assets covered by one share link.
 *
 * The table has no surrogate key — its only unique index is
 * (asset, type, share_id) — so all three columns are declared as the composite
 * primary key. That also stops Sequelize inventing an `id` column that does
 * not exist. (The legacy model created that phantom column and then called
 * removeAttribute('id') to undo it.)
 */
const ShareList = connections.applicationNew.define(
  'share_list',
  {
    asset: { type: DataTypes.STRING, primaryKey: true },
    type: { type: DataTypes.INTEGER, primaryKey: true },
    share_id: { type: DataTypes.INTEGER, primaryKey: true },
  },
  { tableName: 'share_list', freezeTableName: true, underscored: true, timestamps: false }
);

module.exports = ShareList;
