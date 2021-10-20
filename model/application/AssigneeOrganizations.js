const Sequelize = require("sequelize");

const connection = require("../../config/db.config");


const AssigneeOrganizations = connection.applicationNew.define('assignee_organizations',{
    assignee_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    }, 
    assignee_organization:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    assignee_query:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    domain:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    api_logo:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    organisation_id:{
        type: Sequelize.INTEGER,
        allowNull: true,
    }
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true,
    tableName: 'assignee_organizations'
});

module.exports = AssigneeOrganizations;