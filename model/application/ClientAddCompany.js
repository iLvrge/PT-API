const Sequelize = require("sequelize");

const connection = require("../../config/db.config");


const ClientAddCompany = connection.applicationNew.define('client_add_company',{
    company_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    }, 
    name:{
        type: Sequelize.STRING,
        allowNull: false,
    },
    status:{
        type: Sequelize.INTEGER,
        allowNull: false,
    },
},
{
    underscored: true,
    timestamps: false,
    freezeTableName: true,
    tableName: 'client_add_company',
});

module.exports = ClientAddCompany;