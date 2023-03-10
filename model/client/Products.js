const Sequelize = require("sequelize");


const Products = {
    mainStructure: {
        product_id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },	
        category_id: {
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
        tableName: 'products'
    }
}



module.exports = Products;