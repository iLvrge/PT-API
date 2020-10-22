const Sequelize = require("sequelize");

const connection = require("../../config/db.config");

const ActivityLog = connection.resources.define('activity_log',{
    activity_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
    },   
    organisation_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    user_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    type:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    company_name: {
        type: Sequelize.STRING,
        allowNull: false,
    },
    representative_company_name: {
        type: Sequelize.STRING,
        allowNull: false,
    },
    assets_counter:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },     
    activity_date: {
        type: Sequelize.DATE,
        allowNull: false,
    }
},
{
    underscored: true,
    primaryKey: false,
    timestamps: false,
    freezeTableName: true,
    tableName: 'activity_log'
});

module.exports = ActivityLog;