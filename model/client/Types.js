const Sequelize = require("sequelize");

const Types = {
    mainStructure: {
        type_id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },  
		name:{
            type: Sequelize.STRING,
			allowNull: false,
        },
    },
    options: {
        underscored: true,
        timestamps: false,
        freezeTableName: true,
        tableName: 'type'
    }
}

module.exports = Types;