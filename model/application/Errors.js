const Sequelize = require("sequelize");

const connection = require("../../config/db.config");


const Errors = connection.application.define('error',{
    error_id: {
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

module.exports = Errors;