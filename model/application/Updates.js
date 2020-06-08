const Sequelize = require("sequelize");

const connection = require("../../config/db.config");


const Updates = connection.application.define('update',{
    update_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },        
    organisation_id:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    update_type:{
        type: Sequelize.STRING,
        allowNull: true,
    },
    update_assignment_count:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    update_asset_count:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    update_list:{
        type: Sequelize.STRING,
        allowNull: false,
    }
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true,
    tableName: 'update'
});

module.exports = Updates;