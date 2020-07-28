const Sequelize = require("sequelize");

const connection = require("../../config/db.config");

const AssignorAndAssignee = require("./AssignorAndAssignee");

const Assignors = connection.application.define('assignor',{
    rf_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },  
    or_name:{
        type: Sequelize.STRING,
        allowNull: false,
    }, 
    exec_dt:{
        type: Sequelize.DATE,
        allowNull: false,
    },
    ack_dt:{
        type: Sequelize.DATE,
        allowNull: false,
    },
    assignor_and_assignee_id:{
        type: Sequelize.INTEGER,
        allowNull: true,
    }
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true
});

Assignors.belongsTo(AssignorAndAssignee, { foreignKey: 'assignor_and_assignee_id', as: 'assignor_and_assignee' });

module.exports = Assignors;