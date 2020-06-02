const Sequelize = require("sequelize");

const connection = require("../../config/db.config");

const Representatives = require("./Representatives");

const Assignees = connection.resources.define('assignee',{
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
    freezeTableName: true
});

module.exports = Assignees;