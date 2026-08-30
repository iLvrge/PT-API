'use strict';

/**
 * Write models for the db_uspto corpus.
 *
 * Reads go through raw SQL like everywhere else; these exist for the
 * normalisation writes the admin console performs — pointing parties, law
 * firms and lawyers at a canonical representative.
 */

const { DataTypes } = require('sequelize');
const { connections } = require('../index');

const options = { freezeTableName: true, underscored: true, timestamps: false };
const timestamped = { ...options, timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' };

const define = (name, attributes, opts) => connections.resources.define(name, attributes, opts);

/** The canonical company a set of recorded names normalises to. */
const Representative = define(
  'representative',
  {
    representative_id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    representative_name: { type: DataTypes.STRING, allowNull: false },
  },
  { ...timestamped, tableName: 'representative' }
);

/** A party as recorded on an assignment, before normalisation. */
const AssignorAndAssignee = define(
  'assignor_and_assignee',
  {
    assignor_and_assignee_id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
    instances: { type: DataTypes.INTEGER, allowNull: true },
    representative_id: { type: DataTypes.BIGINT, allowNull: true },
    references: { type: DataTypes.INTEGER, allowNull: true },
  },
  { ...options, tableName: 'assignor_and_assignee' }
);

const LawFirm = define(
  'law_firm',
  {
    law_firm_id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
    instances: { type: DataTypes.INTEGER, allowNull: true },
    representative_id: { type: DataTypes.BIGINT, allowNull: true },
  },
  { ...options, tableName: 'law_firm' }
);

const RepresentativeLawFirm = define(
  'representative_law_firm',
  {
    representative_id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    representative_name: { type: DataTypes.STRING, allowNull: false },
  },
  { ...timestamped, tableName: 'representative_law_firm' }
);

const Lawyer = define(
  'lawyer',
  {
    lawyer_id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    law_firm_id: { type: DataTypes.BIGINT, allowNull: true },
    name: { type: DataTypes.STRING, allowNull: false },
    instances: { type: DataTypes.INTEGER, allowNull: true },
    representative_lawyer_id: { type: DataTypes.BIGINT, allowNull: true },
  },
  { ...options, tableName: 'lawyer' }
);

const RepresentativeLawyer = define(
  'representative_lawyer',
  {
    representative_lawyer_id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    representative_name: { type: DataTypes.STRING, allowNull: false },
  },
  { ...timestamped, tableName: 'representative_lawyer' }
);

/** The correspondent recorded on an assignment — usually the filing law firm. */
const Correspondent = define(
  'correspondent',
  {
    rf_id: { type: DataTypes.BIGINT, primaryKey: true },
    cname: { type: DataTypes.STRING, allowNull: true },
    caddress_1: { type: DataTypes.STRING, allowNull: true },
    caddress_2: { type: DataTypes.STRING, allowNull: true },
    caddress_3: { type: DataTypes.STRING, allowNull: true },
    caddress_4: { type: DataTypes.STRING, allowNull: true },
    caddress_5: { type: DataTypes.STRING, allowNull: true },
    caddress_6: { type: DataTypes.STRING, allowNull: true },
    caddress_7: { type: DataTypes.STRING, allowNull: true },
    law_firm_id: { type: DataTypes.BIGINT, allowNull: true },
  },
  { ...options, tableName: 'correspondent' }
);

/** Which transaction an address was taken from, per company. */
const RepresentativeAddress = define(
  'representative_address',
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    representative_id: { type: DataTypes.BIGINT, allowNull: false },
    rf_id: { type: DataTypes.BIGINT, allowNull: false },
    assignor_and_assignee_id: { type: DataTypes.BIGINT, allowNull: false },
  },
  { ...timestamped, tableName: 'representative_address' }
);

/** Party names seen in PTAB proceedings rather than recorded assignments. */
const PtabName = define(
  'ptab_parties',
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
    representative_id: { type: DataTypes.BIGINT, allowNull: true },
    references: { type: DataTypes.INTEGER, allowNull: true },
  },
  { ...options, tableName: 'ptab_parties' }
);

/** A customer's request to have a company added to the corpus. */
const ClientAddCompany = connections.applicationNew.define(
  'client_add_company',
  {
    company_id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: true },
    organisation_id: { type: DataTypes.INTEGER, allowNull: true },
    representative_id: { type: DataTypes.BIGINT, allowNull: true },
    account_id: { type: DataTypes.INTEGER, allowNull: true },
    status: { type: DataTypes.INTEGER, allowNull: true },
    request_date: { type: DataTypes.DATE, allowNull: true },
  },
  { ...options, tableName: 'client_add_company' }
);

module.exports = {
  Representative,
  AssignorAndAssignee,
  LawFirm,
  RepresentativeLawFirm,
  Lawyer,
  RepresentativeLawyer,
  Correspondent,
  RepresentativeAddress,
  PtabName,
  ClientAddCompany,
};
