const Sequelize = require("sequelize");

const connection = require("../../config/db.config");

const ReclassifyLog = connection.resources.define('reclassify_log',{
    id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
    },   
    organisation_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    status:{
        type: Sequelize.INTEGER,
        allowNull: false,
    }, 
},
{
    underscored: true,
    primaryKey: false,
    timestamps: true,
    freezeTableName: true,
    tableName: 'reclassify_log'
});

module.exports = ReclassifyLog;