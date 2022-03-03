const Sequelize = require("sequelize");

const connection = require("../../config/db.config");


const ReportExample = connection.applicationNew.define('dashboard_report_example',{    
    activity_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true
    },
    organisation_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
    },        
    type:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    grant_doc_num:{
        type: Sequelize.STRING,
        allowNull: false,
    },
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true,
    tableName: 'dashboard_report_example',
});

module.exports = ReportExample;