const Sequelize = require("sequelize");

const connection = require("../../config/db.config");


const Repository = connection.applicationNew.define('repositories',{
    repository_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true
    }, 
    organisation_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },  
    user_account:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    container_id:{
        type: Sequelize.STRING,
        allowNull: false,
    },   
    container_name:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    breadcrumb:{
        type: Sequelize.STRING,
        allowNull: false,
    },
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true,
    tableName: 'repositories'
});


module.exports = Repository;