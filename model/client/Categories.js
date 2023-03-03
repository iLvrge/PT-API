const Sequelize = require("sequelize");


const Categories = {
    mainStructure: {
        category_id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true
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
        tableName: 'categories'
    }
}



module.exports = Categories;