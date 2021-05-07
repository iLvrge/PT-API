const Sequelize = require("sequelize");

const connection = require("../../config/db.config");


const AssetsTransfer = connection.application.define('assets_transfer',{
    asset_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },  
    grant_doc_num: {
        type: Sequelize.STRING,
        allowNull: true,
    },  
    appno_doc_num: {
        type: Sequelize.STRING,
        allowNull: true,
    },    
    organisation_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    layout_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    status:{
        type: Sequelize.INTEGER,
        allowNull: false,
    }
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true
});

module.exports = AssetsTransfer;