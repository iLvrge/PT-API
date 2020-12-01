const Sequelize = require("sequelize");

const connection = require("../../config/db.config");

const MissingInventorProcess = connection.resources.define('missing_inventor_process',{
    process_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
    },   
    organisation_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    representative_id:{
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
    timestamps: false,
    freezeTableName: true,
    tableName: 'missing_inventor_process'
});

module.exports = MissingInventorProcess;