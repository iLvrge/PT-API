const Sequelize = require("sequelize");

const connection = require("../../config/db.config");


const VirtualTransactions = connection.applicationNew.define('virtual_transactions',{
    transaction_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },        
    organisation_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    representative_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    spreadsheet_id:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    sheet_id:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    name:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    channel:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    count_assets:{
        type: Sequelize.INTEGER,
        allowNull: false,
    }
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true,
    tableName: 'virtual_transactions'
});

module.exports = VirtualTransactions;