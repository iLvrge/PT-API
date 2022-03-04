const Sequelize = require("sequelize");

const ClientRepresentatives = {
    mainStructure: {
        representative_id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },        
        representative_name:{
            type: Sequelize.STRING,
            allowNull: true,
        },
        original_name:{
            type: Sequelize.STRING,
            allowNull: false,
        },
        instances:{
            type: Sequelize.INTEGER,
            allowNull: false,
        },
        parent_id:{
            type: Sequelize.INTEGER,
            allowNull: true,
        },
        child:{
            type: Sequelize.INTEGER,
            allowNull: true,
        },
        type:{
            type: Sequelize.INTEGER,
            allowNull: true,
        },
        status:{
            type: Sequelize.INTEGER,
            allowNull: true,
        },
    }, 
    options: {
        underscored: true,
        timestamps: false,
        freezeTableName: true,
        tableName: 'representative'
    }
}

module.exports = ClientRepresentatives;