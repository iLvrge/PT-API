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
    type:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    value:{
        type: Sequelize.INTEGER,
        allowNull: false,
    }
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true
});

module.exports = Transactions;