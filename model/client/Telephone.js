const Sequelize = require("sequelize");

const Telephone = {
    mainStructure: {
        telephone_id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },  
		representative_id:{
            type: Sequelize.INTEGER,
			allowNull: false,
        },		
        telephone_number:{
            type: Sequelize.STRING,
			allowNull: false,
        }
    },
    options: {
        underscored: true,
        timestamps: false,
        freezeTableName: true,
        tableName: 'telephone'
    }
}



module.exports = Telephone;