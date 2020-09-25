const Sequelize = require("sequelize");

const connection = require("../../config/db.config");

const Assignments = require("./Assignments");

const RepresentativeTransactions = connection.resources.define('representative_transactions',{
    representative_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
    },    
    organisation_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
    }, 
    rf_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
    },  
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true,
    tableName: 'representative_transactions'
});



module.exports = RepresentativeTransactions;