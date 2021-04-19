const Sequelize = require("sequelize");

const connection = require("../../config/db.config");

const Templates = connection.applicationNew.define('templates',{
    template_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },   
    layout_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },      
    user_account:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    organisation_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    container_name:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    container_id:{
        type: Sequelize.STRING,
        allowNull: false,
    }
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true,
    tableName: 'templates'
});

module.exports = Templates;