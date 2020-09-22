const Sequelize = require("sequelize");

const CollectionCompanies = {
    mainStructure: {
        collection_company_id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        collection_id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },  		      
        name:{
            type: Sequelize.STRING,
            allowNull: false,
        },
        instances: {
            type: Sequelize.INTEGER,
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
        tableName: 'collection_company'
    }
}

module.exports = CollectionCompanies;