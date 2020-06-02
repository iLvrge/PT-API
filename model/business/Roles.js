const Sequelize = require("sequelize");

const connection = require("../../config/db.config");

const Roles = connection.business.define('role',{
    role_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },        
    name:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    created_at:{
        type: Sequelize.DATE,
        allowNull: true,
    },
    updated_at:{
        type: Sequelize.DATE,
        allowNull: true,
    },
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true
});

module.exports = Roles;