const Sequelize = require("sequelize");

const Firms = {
    mainStructure: {
        firm_id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },  
        firm_name:{
            type: Sequelize.STRING,
            allowNull: false,
        },
		firm_logo:{
            type: Sequelize.STRING,
            allowNull: false,
        },        
		firm_linkedin_url:{
            type: Sequelize.INTEGER,
            allowNull: true,
        }
    },
    options: {
        underscored: true,
        timestamps: false,
        freezeTableName: true,
        tableName: 'firm'
    }
}



module.exports = Firms;