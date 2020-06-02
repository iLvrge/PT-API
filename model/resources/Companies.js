const Sequelize = require("sequelize");

const connection = require("../../config/db.config");

const Representatives = require("./Representatives");


const Company = connection.resources.define('company',{
    company_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },        
    name:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    instances:{
        type: Sequelize.INTEGER,
        allowNull: true,
    },
    representative_id:{
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
            model: Representatives,
            key: 'representative_id',
        }
    }
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true
});

module.exports = Company;