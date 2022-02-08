const Sequelize = require("sequelize");

const connection = require("../../config/db.config");


const AssetsForSale = connection.applicationNew.define('assets_for_sale',{
    sales_id:{
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    appno_doc_num:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    grant_doc_num:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    organisation_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
    }    
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true,
    tableName: 'assets_for_sale',
});

module.exports = AssetsForSale;