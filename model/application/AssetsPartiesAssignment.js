const Sequelize = require("sequelize");

const connection = require("../../config/db.config");


const AssetsPartiesAssignment = connection.applicationNew.define('activity_parties_transactions',{
    organisation_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
    },        
    company_id:{
        type: Sequelize.INTEGER,
        allowNull: false, 
    },
    rf_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
        primary: true,
    },
    exec_dt:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    assignor_and_assignee_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    activity_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true,
    tableName: 'activity_parties_transactions',
    schema: "db_new_application"
});

module.exports = AssetsPartiesAssignment;