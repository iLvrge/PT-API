const Sequelize = require("sequelize");

const AssetsChannel = {
    mainStructure: {
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },  
		channel_id:{
            type: Sequelize.STRING,
			allowNull: false,
        },		
        asset:{
            type: Sequelize.STRING,
			allowNull: false,
        },
    },
    options: {
        underscored: true,
        timestamps: false,
        freezeTableName: true,
        tableName: 'assets_channel'
    }
}


module.exports = AssetsChannel;