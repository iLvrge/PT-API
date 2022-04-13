const Sequelize = require("sequelize");

const connection = require("../../config/db.config");

const Assignors = require("./Assignors");

const Assignees = require("./Assignees");

const List2 = connection.resources.define('list2',{
    representative_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
    },  
    representative_name: {
        type: Sequelize.STRING,
        allowNull: false,
    },  
    organisation_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
    }, 
    company_id: {
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
    tableName: 'list2'
});

List2.belongsTo(Assignors, { foreignKey: 'rf_id', as: 'assignor', otherKey: 'rf_id'});
List2.belongsTo(Assignees, { foreignKey: 'rf_id', as: 'assignee', otherKey: 'rf_id'});

module.exports = List2;