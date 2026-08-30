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

  address: {
    attributes: {
      address_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      representative_id: { type: DataTypes.INTEGER, allowNull: false },
      street_address: { type: DataTypes.STRING, allowNull: true },
      suite: { type: DataTypes.STRING, allowNull: true },
      city: { type: DataTypes.STRING, allowNull: true },
      state: { type: DataTypes.STRING, allowNull: true },
      country: { type: DataTypes.STRING, allowNull: true },
      zip_code: { type: DataTypes.STRING, allowNull: true },
      telephone: { type: DataTypes.STRING, allowNull: true },
      telephone_2: { type: DataTypes.STRING, allowNull: true },
      telephone_3: { type: DataTypes.STRING, allowNull: true },
    },
    options: {
      tableName: 'address',
      freezeTableName: true,
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },

  categories: {
    attributes: {
      category_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING, allowNull: false },
    },
    options: {
      tableName: 'categories',
      freezeTableName: true,
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },

  products: {
    attributes: {
      product_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      category_id: { type: DataTypes.INTEGER, allowNull: false },
      name: { type: DataTypes.STRING, allowNull: false },
    },
    options: {
      tableName: 'products',
      freezeTableName: true,
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },

  collection: {
    attributes: {
      collection_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      user_id: { type: DataTypes.INTEGER, allowNull: true },
      name: { type: DataTypes.STRING, allowNull: false },
    },
    options: {
      tableName: 'collection',
      freezeTableName: true,
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },

  collection_company: {
    attributes: {
      collection_company_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      collection_id: { type: DataTypes.INTEGER, allowNull: false },
      name: { type: DataTypes.STRING, allowNull: true },
      instances: { type: DataTypes.INTEGER, allowNull: true },
    },
    options: {
      tableName: 'collection_company',
      freezeTableName: true,
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },

  professional: {
    attributes: {
      professional_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      first_name: { type: DataTypes.STRING, allowNull: true },
      last_name: { type: DataTypes.STRING, allowNull: true },
      email_address: { type: DataTypes.STRING, allowNull: true },
      telephone: { type: DataTypes.STRING, allowNull: true },
      telephone1: { type: DataTypes.INTEGER, allowNull: true },
      linkedin_url: { type: DataTypes.STRING, allowNull: true },
      profile_logo: { type: DataTypes.STRING, allowNull: true },
      firm_id: { type: DataTypes.INTEGER, allowNull: true },
      type: { type: DataTypes.INTEGER, allowNull: true },
    },
    options: {
      tableName: 'professional',
      freezeTableName: true,
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },

  lawfirm: {
    attributes: {
      lawfirm_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING, allowNull: false },
    },
    options: {
      tableName: 'lawfirm',
      freezeTableName: true,
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },

  lawfirm_address: {
    attributes: {
      address_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      lawfirm_id: { type: DataTypes.INTEGER, allowNull: false },
      street_address: { type: DataTypes.STRING, allowNull: true },
      suite: { type: DataTypes.STRING, allowNull: true },
      city: { type: DataTypes.STRING, allowNull: true },
      state: { type: DataTypes.STRING, allowNull: true },
      country: { type: DataTypes.STRING, allowNull: true },
      zip_code: { type: DataTypes.STRING, allowNull: true },
      telephone: { type: DataTypes.STRING, allowNull: true },
    },
    options: {
      tableName: 'lawfirm_address',
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
