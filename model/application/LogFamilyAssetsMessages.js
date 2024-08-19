const Sequelize = require("sequelize");

const connection = require("../../config/db.config");


const LogFamilyAssetsMessages = connection.applicationNew.define('LogFamilyAssetsMessages',{
    id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    total_assets:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    retrieved_assets:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    organisation_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    company_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    start_time:{
        type: Sequelize.DATE,
        defaultValue: Sequelize.DATE
    },
    end_time:{
        type: Sequelize.DATE,
        defaultValue: Sequelize.DATE
    },
    status:{
        type: Sequelize.INTEGER, 
    }
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: false
});

module.exports = LogFamilyAssetsMessages;