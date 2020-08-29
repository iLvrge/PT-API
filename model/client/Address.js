const Sequelize = require("sequelize");

const Address = {
    mainStructure: {
        address_id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },  
		representative_id:{
            type: Sequelize.INTEGER,
			allowNull: false,
        },		
        address:{
            type: Sequelize.STRING,
			allowNull: false,
        }
    },
    options: {
        underscored: true,
        timestamps: false,
        freezeTableName: true,
        tableName: 'address'
    }
}



module.exports = Address;