const Sequelize = require("sequelize");

const connection = require("../../config/db.config");

const AssignorAndAssignee = require("./AssignorAndAssignee");

const Assignees = connection.application.define('assignee',{
    rf_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },  
    ee_name:{
        type: Sequelize.STRING,
        allowNull: false,
    }, 
    ee_address_1:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    ee_address_2:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    ee_city:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    ee_state:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    ee_postcode:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    ee_country:{
        type: Sequelize.STRING,
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

Assignees.belongsTo(AssignorAndAssignee, { foreignKey: 'assignor_and_assignee_id', as: 'assignor_and_assignee' });

module.exports = Assignees;