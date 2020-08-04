const Sequelize = require("sequelize");

const connection = require("../../config/db.config");


const RecentTransaction = connection.resources.define('recent_transaction_update',{
    id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },        
    conveyance_text:{
        type: Sequelize.STRING,
        allowNull: false,
    },
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true,
    tableName: 'recent_transaction_update'
});




module.exports = RecentTransaction;