const Sequelize = require("sequelize");

const connection = require("../../config/db.config");

const Assignors = require("./Assignors");

const Assignees = require("./Assignees");

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

RepresentativeTransactions.belongsTo(Assignors, { foreignKey: 'rf_id', as: 'assignor', otherKey: 'rf_id'});
RepresentativeTransactions.belongsTo(Assignees, { foreignKey: 'rf_id', as: 'assignee', otherKey: 'rf_id'});

module.exports = RepresentativeTransactions;