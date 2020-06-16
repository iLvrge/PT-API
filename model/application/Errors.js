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
    appno_doc_num:{
        type: Sequelize.INTEGER,
        allowNull: false,
    }
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true,
    tableName: 'error'
});


module.exports = Errors;