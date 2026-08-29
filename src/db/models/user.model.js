'use strict';

/**
 * Business `user` model — the WRITE side for user records.
 *
 * Reads of users go through raw SQL in users.repository.js; this model exists
 * only for create / update / destroy, per the read/write split.
 *
 * last_name is NOT NULL in the schema but the application treats it as
 * optional (audit S1) — the service defaults it to '' before writing, so the
 * model stays faithful to the column while the API accepts a blank surname.
 */

const { DataTypes } = require('sequelize');
const { connections } = require('../index');

const User = connections.business.define(
  'user',
  {
    user_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    first_name: { type: DataTypes.STRING, allowNull: false },
    last_name: { type: DataTypes.STRING, allowNull: false },
    job_title: { type: DataTypes.STRING, allowNull: true },
    username: { type: DataTypes.STRING, allowNull: true },
    email_address: { type: DataTypes.STRING, allowNull: false },
    password: { type: DataTypes.STRING, allowNull: false },
    organisation_id: { type: DataTypes.INTEGER, allowNull: false },
    logo: { type: DataTypes.STRING, allowNull: true },
    linkedin_url: { type: DataTypes.STRING, allowNull: true },
    role_id: { type: DataTypes.INTEGER, allowNull: false },
    type: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.INTEGER, allowNull: true },
    authentication_code: { type: DataTypes.STRING, allowNull: true },
    auth_token_expire: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: 'user',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

module.exports = User;
