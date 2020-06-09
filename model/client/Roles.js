const Sequelize = require("sequelize");

const connection = require("../../config/db.config");

const Roles = {
    mainStructure: {
        role_id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },        
        name:{
            type: Sequelize.STRING,
            allowNull: false,
        }
    },
    options: {
        underscored: true,
        timestamps: false,
        freezeTableName: true,
        tableName: 'role'
    }
}

module.exports = Roles;