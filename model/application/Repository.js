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
        allowNull: true,
    },   
    container_name:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    breadcrumb:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    template_container_id:{
        type: Sequelize.STRING,
        allowNull: true,
    },   
    template_container_name:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    template_breadcrumb:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    utilities_container_id:{
        type: Sequelize.STRING,
        allowNull: true,
    },   
    utilities_name:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    utilities_breadcrumb:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    foreign_assets_container_id:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    file_container_id:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    file_container_child1_id:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    file_container_child2_id:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    file_container_child3_id:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    file_container_child4_id:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    file_container_child5_id:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    file_container_child6_id:{
        type: Sequelize.STRING,
        allowNull: true,
    }
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true,
    tableName: 'repositories'
});


module.exports = Repository;