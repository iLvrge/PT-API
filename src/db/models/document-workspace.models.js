'use strict';

// Layouts / Templates / Repositories (db_new_application) used by the
// documents module's Google-workspace integration.

const { DataTypes } = require('sequelize');
const { connections } = require('../index');

const Layouts = connections.applicationNew.define(
  'layouts',
  {
    layout_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    layout_name: { type: DataTypes.STRING, allowNull: true },
  },
  { tableName: 'layouts', freezeTableName: true, underscored: true, timestamps: false }
);

const Templates = connections.applicationNew.define(
  'templates',
  {
    template_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    layout_id: { type: DataTypes.INTEGER, allowNull: true },
    user_account: { type: DataTypes.STRING, allowNull: true },
    organisation_id: { type: DataTypes.INTEGER, allowNull: true },
    container_name: { type: DataTypes.STRING, allowNull: true },
    container_id: { type: DataTypes.STRING, allowNull: true },
  },
  { tableName: 'templates', freezeTableName: true, underscored: true, timestamps: false }
);

const Repositories = connections.applicationNew.define(
  'repositories',
  {
    repository_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    organisation_id: { type: DataTypes.INTEGER, allowNull: true },
    user_account: { type: DataTypes.STRING, allowNull: true },
    container_id: { type: DataTypes.STRING, allowNull: true },
    container_name: { type: DataTypes.STRING, allowNull: true },
    breadcrumb: { type: DataTypes.TEXT, allowNull: true },
    template_container_id: { type: DataTypes.STRING, allowNull: true },
    template_container_name: { type: DataTypes.STRING, allowNull: true },
    template_breadcrumb: { type: DataTypes.TEXT, allowNull: true },
    utilities_container_id: { type: DataTypes.STRING, allowNull: true },
    utilities_name: { type: DataTypes.STRING, allowNull: true },
    utilities_breadcrumb: { type: DataTypes.TEXT, allowNull: true },
  },
  { tableName: 'repositories', freezeTableName: true, underscored: true, timestamps: false }
);

module.exports = { Layouts, Templates, Repositories };
