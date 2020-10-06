const Sequelize = require("sequelize");

const connection = require("../../config/db.config");

const SuperKeywords = connection.resources.define('super_keyword',{
    super_keyword_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },  
    super_keyword_name:{
        type: Sequelize.STRING,
        allowNull: false,
    }
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true
});

module.exports = SuperKeywords;