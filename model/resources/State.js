const Sequelize = require("sequelize");

const connection = require("../../config/db.config");

const State = connection.resources.define('state',{
    state_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },  
    name:{
        type: Sequelize.STRING,
        allowNull: false,
    }
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true
});

module.exports = State;