const Sequelize = require("sequelize");

const connection = require("../../config/db.config");

const Representatives = require("./Representatives");


const AssignorAndAssignee = connection.resources.define('assignor_and_assignee',{
    assignor_and_assignee_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },        
    name:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    instances:{
        type: Sequelize.INTEGER,
        allowNull: true,
    },
    representative_id:{
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
            model: Representatives,
            key: 'representative_id',
        }
    }
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true,
    tableName: 'assignor_and_assignee'
});

AssignorAndAssignee.belongsTo(Representatives, { foreignKey: 'representative_id', as: 'representative', targetKey: 'representative_id' });

module.exports = AssignorAndAssignee;