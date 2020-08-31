const Sequelize = require("sequelize");

const Lawyer = {
    mainStructure: {
        lawyer_id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },  
		representative_id:{
            type: Sequelize.INTEGER,
			allowNull: false,
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
        tableName: 'lawyer'
    }
}



module.exports = Lawyer;