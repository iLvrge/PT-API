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
        street_address:{
            type: Sequelize.STRING,
			allowNull: true,
        },
        suite:{
            type: Sequelize.STRING,
			allowNull: true,
        },
        city:{
            type: Sequelize.STRING,
			allowNull: true,
        },
        state:{
            type: Sequelize.STRING,
			allowNull: true,
        },
        country:{
            type: Sequelize.STRING,
			allowNull: true,
        },
        zip_code:{
            type: Sequelize.STRING,
			allowNull: true,
        },
        telephone:{
            type: Sequelize.STRING,
			allowNull: true,
        },
        telephone_2:{
            type: Sequelize.STRING,
			allowNull: true,
        },
        telephone_3:{
            type: Sequelize.STRING,
			allowNull: true,
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