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
        tableName: 'telephone'
    }
}



module.exports = Telephone;