'use strict';

/**
 * Tenant model definitions and a per-connection registry.
 *
 * The legacy code called sequelize.define(...) on every request (audit P6);
 * here each tenant model is defined once per tenant connection and cached on
 * the connection instance, so repeat requests reuse the compiled model.
 *
 * Definitions mirror the legacy model/client/*.js `mainStructure`/`options`.
 */

const { DataTypes } = require('sequelize');

const DEFINITIONS = {
  telephone: {
    attributes: {
      telephone_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      representative_id: { type: DataTypes.INTEGER, allowNull: false },
      telephone_number: { type: DataTypes.STRING, allowNull: false },
    },
    options: {
      tableName: 'telephone',
      freezeTableName: true,
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },
};

/**
 * Get (defining once, then caching) a tenant model on a given connection.
 * @param {import('sequelize').Sequelize} connection a tenant connection
 * @param {string} name key in DEFINITIONS
 */
const tenantModel = (connection, name) => {
  const def = DEFINITIONS[name];
  if (!def) throw new Error(`Unknown tenant model: ${name}`);
  if (connection.models && connection.models[name]) return connection.models[name];
  return connection.define(name, def.attributes, def.options);
};

module.exports = { tenantModel, DEFINITIONS };
