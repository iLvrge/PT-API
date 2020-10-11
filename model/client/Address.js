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
    options: {
        underscored: true,
        timestamps: true,
        freezeTableName: true,
        tableName: 'address'
    }
}



module.exports = Address;