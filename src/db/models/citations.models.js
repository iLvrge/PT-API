'use strict';

/**
 * The local cache of PatentsView citation data.
 *
 * Citation lookups are slow and rate limited, so the assignees, the cited
 * patents and the citing-patent links are written back here on first sight and
 * read from the database afterwards.
 */

const { DataTypes } = require('sequelize');
const { connections } = require('../index');

const options = {
  freezeTableName: true, underscored: true, timestamps: false,
};

const AssigneeOrganization = connections.applicationNew.define(
  'assignee_organizations',
  {
    assignee_id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    assignee_organization: { type: DataTypes.STRING, allowNull: false },
    assignee_query: { type: DataTypes.STRING, allowNull: true },
    domain: { type: DataTypes.STRING, allowNull: true },
    api_logo: { type: DataTypes.STRING, allowNull: true },
    without_square: { type: DataTypes.STRING, allowNull: true },
    image_url: { type: DataTypes.STRING, allowNull: true },
    organisation_id: { type: DataTypes.BIGINT, allowNull: true },
  },
  { ...options, tableName: 'assignee_organizations' }
);

const CitedPatent = connections.applicationNew.define(
  'cited_patents',
  {
    cited_patent_id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    patent_number: { type: DataTypes.STRING, allowNull: false },
    assignee_id: { type: DataTypes.BIGINT, allowNull: false },
  },
  { ...options, tableName: 'cited_patents' }
);

const CitingPatentWithAssignee = connections.applicationNew.define(
  'citing_patents_with_assignee',
  {
    citing_id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    patent_number: { type: DataTypes.STRING, allowNull: false },
    citing_patent_number: { type: DataTypes.STRING, allowNull: false },
    app_date: { type: DataTypes.DATEONLY, allowNull: true },
    assignee_organization: { type: DataTypes.STRING, allowNull: true },
    assignee_id: { type: DataTypes.BIGINT, allowNull: true },
  },
  { ...options, tableName: 'citing_patents_with_assignee' }
);

module.exports = { AssigneeOrganization, CitedPatent, CitingPatentWithAssignee };
