const Sequelize = require("sequelize");

const Collections = {
    mainStructure: {
        collection_id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },  
		user_id:{
            type: Sequelize.INTEGER,
			allowNull: true,
        },        
        name:{
            type: Sequelize.STRING,
            allowNull: false,
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
        tableName: 'collection'
    }
}

module.exports = Collections;