const Sequelize = require("sequelize");

const Documents = {
    mainStructure: {
        document_id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },  
        title:{
            type: Sequelize.STRING,
            allowNull: false,
        },
		file:{
            type: Sequelize.STRING,
            allowNull: false,
        },        
		type:{
            type: Sequelize.INTEGER,
            allowNull: true,
        },
		description:{
            type: Sequelize.STRING,
            allowNull: true,
        },
        user_id:{
            type: Sequelize.INTEGER
        },
        created_at:{
            type: Sequelize.DATE,
            defaultValue: Sequelize.DATE
        },
        updated_at:{
            type: Sequelize.DATE,
            defaultValue: Sequelize.DATE
        }
    },
    options: {
        underscored: true,
        timestamps: true,
        freezeTableName: true,
        tableName: 'document'
    }
}



module.exports = Documents;