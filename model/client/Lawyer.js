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
        tableName: 'lawyer'
    }
}



module.exports = Lawyer;