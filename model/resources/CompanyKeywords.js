const Sequelize = require("sequelize");

const connection = require("../../config/db.config");

const CompanyKeywords = connection.resources.define('company_keyword',{
    keyword_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },  
    keyword_name:{
        type: Sequelize.STRING,
        allowNull: false,
    }
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true
});

module.exports = CompanyKeywords;