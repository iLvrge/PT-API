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
            allowNull: false,
        },
        original_name:{
            type: Sequelize.STRING,
            allowNull: false,
        },
        instances:{
            type: Sequelize.INTEGER,
            allowNull: false,
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