const Sequelize = require("sequelize");

const connection = require("../../config/db.config");


const Transactions = connection.application.define('transaction',{
    transaction_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },        
    organisation_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    transaction_type:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    transaction_count:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    transaction_list:{
        type: Sequelize.STRING,
        allowNull: false,
    }
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true,
    tableName: 'transaction'
});

module.exports = Transactions;